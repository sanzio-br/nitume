import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import {
  PaymentFlow,
  PaymentMethodType,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTypeCode,
  StatusHistoryActor,
} from '../common/enums';
import { ErrandStatus } from '../common/enums';
import { AuthContext } from '../common/decorators/auth.decorators';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { ErrandStateMachine } from '../errands/errand-state-machine';
import { ErrandsService } from '../errands/errands.service';
import { Payment } from './payment.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { PAYMENT_TYPES } from './payment-type.reference';
import { STK_GATEWAY } from './stk-gateway/stk-gateway.provider';
import { StkGateway } from './stk-gateway/stk-gateway.interface';
import { MpesaCallbackDto } from './dto/payment.dto';
import { ApiError } from '../common/api-error';
import { CustomerAccountsService } from '../customers/customer-accounts.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../infra/redis/redis.service';
import { RefundTrigger } from './refund-review.entity';
import { RefundsService } from './refunds.service';
import {
  MerchantDetails,
  MerchantPaymentView,
  MerchantRoute,
  ROUTE_TO_FLOW,
  StkStatus,
  routeOf,
  stkStatusOf,
} from './payment-views';

export interface InitiateOptions {
  idempotencyKey?: string;
  merchantRoute?: MerchantRoute;
  paymentMethodId?: string;
}

/** A price-change difference payment as returned to the customer. */
export interface DifferencePaymentView {
  payment: Payment;
  transactions: PaymentTransaction[];
  /** STK status for send_to_runner differences; null for merchant_direct. */
  stkStatus: StkStatus | null;
  /** Set right after a push; null on later reads. */
  checkoutRequestId: string | null;
  merchantPayment: MerchantPaymentView | null;
}

export interface InitiateResult {
  payment: Payment;
  reference: string;
  checkoutRequestId: string;
  transactions: PaymentTransaction[];
  stkStatus: StkStatus;
  merchantPayment: MerchantPaymentView | null;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

const assertIdempotencyKey = (key: string): void => {
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'idempotency_key_invalid',
      'Idempotency-Key must be 8-128 characters: letters, digits, - or _',
    );
  }
};

const isUniqueViolation = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const e = err as { code?: string; driverError?: { code?: string } };
  return e.code === '23505' || e.driverError?.code === '23505';
};

@Injectable()
export class PaymentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentTransaction)
    private readonly transactions: Repository<PaymentTransaction>,
    @InjectRepository(PaymentType)
    private readonly paymentTypes: Repository<PaymentType>,
    @InjectRepository(CustomerProfile)
    private readonly customers: Repository<CustomerProfile>,
    private readonly errands: ErrandsService,
    @Inject(STK_GATEWAY)
    private readonly stk: StkGateway,
    private readonly config: ConfigService,
    private readonly accounts: CustomerAccountsService,
    private readonly refunds: RefundsService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
  ) {}

  /** Lazy, idempotent upsert of the payment_type reference table. */
  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.paymentTypes.find();
    const byCode = new Map(existing.map((t) => [t.code, t]));
    for (const ref of PAYMENT_TYPES) {
      if (!byCode.has(ref.code)) {
        await this.paymentTypes.save(
          this.paymentTypes.create({ ...ref }),
        );
      }
    }
  }

  /**
   * Initiates the customer-to-platform charge: service_fee + runner_fee in
   * one STK push (the two ledger legs share one M-Pesa reference). The
   * merchant/item amount (errand budget) never goes through this charge; the
   * customer settles it by the chosen route (merchant_direct or
   * send_to_runner).
   *
   * Safe retries: with an `Idempotency-Key`, a repeat returns the payment
   * stored under that key without a new push. Without a key, an existing
   * pending or completed payment is returned as is (no second push). A new
   * push only happens after a FAILED result. TIMEOUT is not a failure, so it
   * does not allow a new push either.
   */
  async initiate(
    errandId: string,
    user: AuthContext,
    opts: InitiateOptions = {},
  ): Promise<InitiateResult> {
    const customer = await this.customers.findOne({ where: { userId: user.userId } });
    if (!customer) {
      throw new ForbiddenException('Customer profile not found');
    }
    const errand = await this.errands.getById(errandId);
    if (errand.customerId !== customer.id) {
      throw new ForbiddenException('Errand belongs to another customer');
    }

    if (opts.idempotencyKey !== undefined) {
      assertIdempotencyKey(opts.idempotencyKey);
      const keyed = await this.payments.findOne({
        where: { idempotencyKey: opts.idempotencyKey },
      });
      if (keyed) {
        if (keyed.errandId !== errandId) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'idempotency_key_reused',
            'This Idempotency-Key was already used for another payment',
          );
        }
        return this.resultFor(keyed);
      }
    }

    const existing = await this.primaryPayment(errandId);
    if (existing && existing.status !== PaymentStatus.FAILED) {
      return this.resultFor(existing);
    }

    if (!ErrandStateMachine.canTransition(errand.status, ErrandStatus.PAYMENT_CONFIRMED)) {
      throw new ConflictException(`Errand is not payable now (${errand.status})`);
    }
    if (errand.quotedPrice === null) {
      throw new BadRequestException('Errand has not been quoted yet');
    }
    // An expired quote cannot be paid (row 46): 409 quote_expired.
    await this.errands.assertQuoteCurrentFor(errandId);

    const quote = Number(errand.quotedPrice);
    const serviceFeeRate = this.config.get<number>('pricing.serviceFeeRate', 0.2);
    const runnerFeeRate = this.config.get<number>('pricing.runnerFeeRate', 0.3);
    const serviceFee = round2(quote * serviceFeeRate);
    const runnerFee = round2(quote * runnerFeeRate);
    const budget = Number(errand.budget);
    const merchantAmount = budget > 0 ? round2(budget) : 0;
    const flow = await this.flowFor(errandId, merchantAmount, opts.merchantRoute);
    const phone = await this.payerPhone(user, opts.paymentMethodId);

    const reference = newReference();
    // send_to_runner is platform-mediated (rows 42, 48): the purchase amount
    // joins the same STK charge to Nitume as a merchant_payment leg.
    const collectMerchant = flow === PaymentFlow.CUSTOMER_TO_RUNNER && merchantAmount > 0;
    const chargeKes = serviceFee + runnerFee + (collectMerchant ? merchantAmount : 0);

    const [serviceFeeType, runnerFeeType, merchantType] = await Promise.all([
      this.paymentTypeId(PaymentTypeCode.SERVICE_FEE),
      this.paymentTypeId(PaymentTypeCode.RUNNER_FEE),
      this.paymentTypeId(PaymentTypeCode.MERCHANT_PAYMENT),
    ]);

    // The payment row and its two legs are written together, so a
    // concurrent initiate that loses on a unique index (same key, or the
    // one-active-primary-payment-per-errand index) waits for this commit and
    // then returns a complete payment instead of pushing STK a second time.
    let payment: Payment;
    let txRows: PaymentTransaction[];
    try {
      ({ payment, txRows } = await this.payments.manager.transaction(async (manager) => {
        const paymentRepo = manager.getRepository(Payment);
        const txRepo = manager.getRepository(PaymentTransaction);
        const saved = await paymentRepo.save(
          paymentRepo.create({
            errandId,
            serviceFee: serviceFee.toFixed(2),
            runnerFee: runnerFee.toFixed(2),
            merchantAmount: merchantAmount.toFixed(2),
            paymentFlow: flow,
            status: PaymentStatus.PENDING,
            idempotencyKey: opts.idempotencyKey ?? null,
          }),
        );
        const legRows = [
          txRepo.create({
            paymentId: saved.id,
            paymentTypeId: serviceFeeType,
            mpesaReference: reference,
            amount: serviceFee.toFixed(2),
            status: PaymentTransactionStatus.INITIATED,
          }),
          txRepo.create({
            paymentId: saved.id,
            paymentTypeId: runnerFeeType,
            mpesaReference: reference,
            amount: runnerFee.toFixed(2),
            status: PaymentTransactionStatus.INITIATED,
          }),
        ];
        if (collectMerchant) {
          legRows.push(
            txRepo.create({
              paymentId: saved.id,
              paymentTypeId: merchantType,
              mpesaReference: reference,
              amount: merchantAmount.toFixed(2),
              status: PaymentTransactionStatus.INITIATED,
            }),
          );
        }
        const legs = await txRepo.save(legRows);
        return { payment: saved, txRows: legs };
      }));
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      // Concurrent initiate for this errand: return the payment that won.
      if (opts.idempotencyKey) {
        const keyed = await this.payments.findOne({
          where: { idempotencyKey: opts.idempotencyKey },
        });
        if (keyed) {
          if (keyed.errandId !== errandId) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'idempotency_key_reused',
              'This Idempotency-Key was already used for another payment',
            );
          }
          return this.resultFor(keyed);
        }
      }
      const active = await this.activePrimaryPayment(errandId);
      if (active) {
        return this.resultFor(active);
      }
      throw err;
    }

    const push = await this.stk.push({
      phone,
      amountKes: round2(chargeKes).toFixed(2),
      reference,
      description: `Nitume errand ${errand.reference ?? errandId}`,
    });
    await this.rememberCheckout(txRows, push);

    return {
      payment,
      reference,
      checkoutRequestId: push.checkoutRequestId,
      transactions: txRows,
      stkStatus: this.stkStatus(payment),
      merchantPayment: await this.merchantPaymentFor(payment),
    };
  }

  /** Stored payment as an initiate response (no new STK push). */
  private async resultFor(payment: Payment): Promise<InitiateResult> {
    const tx = await this.transactions.find({ where: { paymentId: payment.id } });
    const stkStatus = this.stkStatus(payment);
    return {
      payment,
      reference: tx[0]?.mpesaReference ?? '',
      checkoutRequestId:
        stkStatus === StkStatus.SUCCESS ? 'PAID' : stkStatus === StkStatus.FAILED ? 'FAILED' : 'PENDING',
      transactions: tx,
      stkStatus,
      merchantPayment: await this.merchantPaymentFor(payment),
    };
  }

  /** The errand's main payment that has not failed (at most one, by index). */
  private activePrimaryPayment(errandId: string): Promise<Payment | null> {
    return this.payments.findOne({
      where: { errandId, priceChangeRequestId: IsNull(), status: Not(PaymentStatus.FAILED) },
    });
  }

  /** The errand's main (service + runner fee) payment, newest first. */
  private primaryPayment(errandId: string): Promise<Payment | null> {
    return this.payments.findOne({
      where: { errandId, priceChangeRequestId: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Records the merchant/item difference of an approved price-change
   * increase (no service or runner fee), paid by the same route as the
   * original merchant amount (rows 44, 48):
   * - send_to_runner: an STK charge to Nitume for the difference (a
   *   merchant_payment leg); the push itself happens after the caller's
   *   transaction commits (`chargeDifference`).
   * - merchant_direct: the customer pays the merchant's Till/Paybill.
   * When the original route is unavailable (no merchant amount so far, or
   * merchant_direct without Till/Paybill details) the customer must pick a
   * route explicitly (`merchant_route_required`). Pass `manager` to write
   * inside the caller's transaction (price-change approval).
   */
  async recordPriceDifference(
    errandId: string,
    priceChangeRequestId: string,
    difference: number,
    route?: MerchantRoute,
    manager?: EntityManager,
  ): Promise<{ payment: Payment; merchantPayment: MerchantPaymentView | null }> {
    const repo = manager ? manager.getRepository(Payment) : this.payments;
    const primary = await repo.findOne({
      where: { errandId, priceChangeRequestId: IsNull(), status: Not(PaymentStatus.FAILED) },
      order: { createdAt: 'DESC' },
    });
    const original = primary ? routeOf(primary.paymentFlow) : null;
    const usable =
      original === MerchantRoute.SEND_TO_RUNNER ||
      (original === MerchantRoute.MERCHANT_DIRECT && (await this.merchantDetailsFor(errandId)) !== null);
    const flow = usable && original
      ? ROUTE_TO_FLOW[original]
      : await this.flowFor(errandId, difference, route);
    const write = (m: EntityManager) =>
      this.saveDifference(m, errandId, priceChangeRequestId, difference, flow);
    const payment = manager ? await write(manager) : await this.payments.manager.transaction(write);
    return { payment, merchantPayment: await this.merchantPaymentFor(payment) };
  }

  /** Difference payment row, plus its merchant_payment leg when charged by STK. */
  private async saveDifference(
    manager: EntityManager,
    errandId: string,
    priceChangeRequestId: string,
    difference: number,
    flow: PaymentFlow,
  ): Promise<Payment> {
    const repo = manager.getRepository(Payment);
    const payment = await repo.save(
      repo.create({
        errandId,
        priceChangeRequestId,
        serviceFee: '0.00',
        runnerFee: '0.00',
        merchantAmount: difference.toFixed(2),
        paymentFlow: flow,
        status: PaymentStatus.PENDING,
      }),
    );
    if (flow === PaymentFlow.CUSTOMER_TO_RUNNER) {
      const txRepo = manager.getRepository(PaymentTransaction);
      await txRepo.save(
        txRepo.create({
          paymentId: payment.id,
          paymentTypeId: await this.paymentTypeId(PaymentTypeCode.MERCHANT_PAYMENT),
          mpesaReference: newReference(),
          amount: difference.toFixed(2),
          status: PaymentTransactionStatus.INITIATED,
        }),
      );
    }
    return payment;
  }

  /**
   * Pushes the STK charge of a send_to_runner difference payment to the
   * errand owner's phone (default M-Pesa method, else login phone). No-op
   * for merchant_direct differences. Call after the recording transaction
   * has committed.
   */
  async chargeDifference(paymentId: string): Promise<DifferencePaymentView> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment?.priceChangeRequestId) {
      throw new NotFoundException('Price difference payment not found');
    }
    if (payment.paymentFlow === PaymentFlow.CUSTOMER_TO_RUNNER && payment.status === PaymentStatus.PENDING) {
      const legs = await this.transactions.find({ where: { paymentId } });
      const errand = await this.errands.getById(payment.errandId);
      const push = await this.stk.push({
        phone: await this.ownerPhone(errand.customerId),
        amountKes: payment.merchantAmount,
        reference: legs[0]?.mpesaReference ?? '',
        description: `Nitume price change ${errand.reference ?? errand.id}`,
      });
      await this.rememberCheckout(legs, push);
      return this.differenceView(payment, push.checkoutRequestId);
    }
    return this.differenceView(payment);
  }

  /**
   * Customer retries the STK charge of a send_to_runner difference after it
   * FAILED: a new difference payment row is written and pushed. A pending,
   * timed-out or paid difference is returned as is (no second push).
   */
  async retryDifference(
    errandId: string,
    priceChangeRequestId: string,
    user: AuthContext,
  ): Promise<DifferencePaymentView> {
    await this.assertOwner(errandId, user);
    const latest = await this.payments.findOne({
      where: { errandId, priceChangeRequestId },
      order: { createdAt: 'DESC' },
    });
    if (!latest) {
      throw new NotFoundException('No price difference payment for this request');
    }
    if (latest.paymentFlow !== PaymentFlow.CUSTOMER_TO_RUNNER) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'difference_not_stk',
        'This difference is paid to the merchant directly, not by STK',
      );
    }
    if (latest.status !== PaymentStatus.FAILED) {
      return this.differenceView(latest);
    }
    const fresh = await this.payments.manager.transaction((manager) =>
      this.saveDifference(
        manager,
        errandId,
        priceChangeRequestId,
        Number(latest.merchantAmount),
        PaymentFlow.CUSTOMER_TO_RUNNER,
      ),
    );
    return this.chargeDifference(fresh.id);
  }

  private async differenceView(
    payment: Payment,
    checkoutRequestId?: string,
  ): Promise<DifferencePaymentView> {
    const transactions = await this.transactions.find({ where: { paymentId: payment.id } });
    return {
      payment,
      transactions,
      stkStatus:
        payment.paymentFlow === PaymentFlow.CUSTOMER_TO_RUNNER ? this.stkStatus(payment) : null,
      checkoutRequestId: checkoutRequestId ?? null,
      merchantPayment: await this.merchantPaymentFor(payment),
    };
  }

  /** Every price-change difference payment of an errand, newest first. */
  private async differencesFor(errandId: string): Promise<DifferencePaymentView[]> {
    const rows = await this.payments.find({
      where: { errandId, priceChangeRequestId: Not(IsNull()) },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.differenceView(row)));
  }

  /** Phone that receives an STK push for the errand owner. */
  private async ownerPhone(customerProfileId: string): Promise<string> {
    const profile = await this.customers.findOne({ where: { id: customerProfileId } });
    if (!profile) {
      throw new NotFoundException('Customer profile not found');
    }
    const methods = await this.accounts.listPaymentMethods(profile.userId);
    const preferred = methods.find(
      (m) => m.type === PaymentMethodType.MPESA && m.isDefault && m.phoneNumber,
    );
    if (preferred?.phoneNumber) {
      return preferred.phoneNumber;
    }
    const owner = await this.users.findById(profile.userId);
    if (!owner) {
      throw new NotFoundException('Customer account not found');
    }
    return owner.phone;
  }

  private async assertOwner(errandId: string, user: AuthContext): Promise<void> {
    const customer = await this.customers.findOne({ where: { userId: user.userId } });
    const errand = await this.errands.getById(errandId);
    if (!customer || errand.customerId !== customer.id) {
      throw new ForbiddenException('Errand belongs to another customer');
    }
  }

  /**
   * Keeps the provider's checkout ids on the legs (`rawCallback.stkPush`) so
   * an unresolved push can be looked up later (STK Query, row 52).
   */
  private async rememberCheckout(
    legs: PaymentTransaction[],
    push: { checkoutRequestId: string; merchantRequestId?: string },
  ): Promise<void> {
    if (legs.length === 0) {
      return;
    }
    const stkPush = {
      checkoutRequestId: push.checkoutRequestId,
      merchantRequestId: push.merchantRequestId ?? null,
      gateway: this.stk.name,
    };
    await this.transactions.save(
      legs.map((leg) => this.transactions.merge(leg, { rawCallback: { ...leg.rawCallback, stkPush } })),
    );
  }

  private async paymentTypeId(code: PaymentTypeCode): Promise<string> {
    const row = await this.paymentTypes.findOne({ where: { code } });
    if (!row) {
      throw new Error('payment_type reference data is not seeded');
    }
    return row.id;
  }

  private stkStatus(payment: Payment): StkStatus {
    return stkStatusOf(payment, this.config.get<number>('payments.stkTimeoutSeconds', 120));
  }

  /**
   * Payment flow for the customer's merchant route. Runner advance is a
   * runner-side capability and never a customer option.
   */
  private async flowFor(
    errandId: string,
    merchantAmount: number,
    route: MerchantRoute | undefined,
  ): Promise<PaymentFlow> {
    if (merchantAmount <= 0) {
      return PaymentFlow.PLATFORM_ONLY;
    }
    if (!route) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'merchant_route_required',
        'Choose how the merchant amount is paid: merchant_direct or send_to_runner',
      );
    }
    if (route === MerchantRoute.MERCHANT_DIRECT && !(await this.merchantDetailsFor(errandId))) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'merchant_details_missing',
        'Paying the merchant directly needs the merchant Till or Paybill details',
      );
    }
    return ROUTE_TO_FLOW[route];
  }

  /**
   * Merchant Till/Paybill details set on the errand by the merchant or an
   * admin (PUT /errands/:id/merchant-details), or null when none are set.
   * merchant_direct is refused until they exist.
   */
  async merchantDetailsFor(errandId: string): Promise<MerchantDetails | null> {
    const errand = await this.errands.getById(errandId);
    if (!errand.merchantTillNumber && !errand.merchantPaybillNumber) {
      return null;
    }
    return {
      merchantName: errand.merchantName,
      tillNumber: errand.merchantTillNumber,
      paybillNumber: errand.merchantPaybillNumber,
      accountReference: errand.merchantAccountReference,
    };
  }

  private async merchantPaymentFor(payment: Payment): Promise<MerchantPaymentView | null> {
    const route = routeOf(payment.paymentFlow);
    if (!route) {
      return null;
    }
    if (route === MerchantRoute.SEND_TO_RUNNER) {
      return { route, amount: payment.merchantAmount, paidTo: 'nitume' };
    }
    const details = await this.merchantDetailsFor(payment.errandId);
    return {
      route,
      amount: payment.merchantAmount,
      paidTo: 'merchant',
      merchantName: details?.merchantName ?? null,
      tillNumber: details?.tillNumber ?? null,
      paybillNumber: details?.paybillNumber ?? null,
      accountReference: details?.accountReference ?? null,
    };
  }

  /**
   * Phone for the STK push: the selected M-Pesa method, else the customer's
   * default M-Pesa method, else the login phone (owner decision Q21).
   */
  private async payerPhone(user: AuthContext, paymentMethodId?: string): Promise<string> {
    const methods = (await this.accounts.listPaymentMethods(user.userId)).filter(
      (m) => m.type === PaymentMethodType.MPESA,
    );
    if (paymentMethodId) {
      const chosen = methods.find((m) => m.id === paymentMethodId);
      if (!chosen?.phoneNumber) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payment_method_invalid',
          'Choose one of your M-Pesa payment methods with a phone number',
        );
      }
      return chosen.phoneNumber;
    }
    const fallback = methods.find((m) => m.isDefault && m.phoneNumber);
    return fallback?.phoneNumber ?? user.phone;
  }

  /**
   * M-Pesa result notification (mock: the same reference returned by
   * initiate). Idempotent: repeated callbacks for an already-final
   * transaction are answered with the stored outcome instead of re-running
   * the state transition.
   */
  async handleCallback(dto: MpesaCallbackDto): Promise<void> {
    const rows = await this.transactions.find({
      where: { mpesaReference: dto.reference },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Unknown mpesaReference');
    }
    const payment = await this.payments.findOne({
      where: { id: rows[0].paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const alreadyFinal = rows.every(
      (r) =>
        r.status === PaymentTransactionStatus.COMPLETED ||
        r.status === PaymentTransactionStatus.FAILED,
    );
    if (alreadyFinal) {
      this.logger.warn(
        `Dropping duplicate callback for ${dto.reference} (final=${rows[0].status})`,
      );
      return;
    }

    const success = dto.resultCode === 0;
    const status = success
      ? PaymentTransactionStatus.COMPLETED
      : PaymentTransactionStatus.FAILED;
    const errandId = errandIdOf(payment);
    // A payment that completes after the task was cancelled opens its refund
    // review in the same transaction that records the completed legs, so a
    // failure cannot leave paid legs without a review (a retried callback is
    // dropped as already final).
    const cancelled =
      success && (await this.errands.getById(errandId)).status === ErrandStatus.CANCELLED;
    await this.payments.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(PaymentTransaction);
      await txRepo.save(
        rows.map((r) =>
          txRepo.merge(r, {
            status,
            // Keeps the push ids (`stkPush`) next to the provider result.
            // eslint-disable-next-line no-misused-spread -- DTO → plain JSON
            rawCallback: { ...r.rawCallback, ...dto, ts: new Date().toISOString() },
          }),
        ),
      );
      await manager
        .getRepository(Payment)
        .update(payment.id, { status: success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED });
      if (cancelled) {
        await this.refunds.openWithin(manager, errandId, RefundTrigger.CANCELLED_AFTER_PAYMENT);
      }
    });

    // A price-change difference never moves the errand (it is already paid).
    if (success && !cancelled && !payment.priceChangeRequestId) {
      await this.confirmErrandAfterPayment(errandId);
    }
  }

  /**
   * Resolves a TIMEOUT payment with the provider (Daraja STK Query, row 52).
   * TIMEOUT is not FAILED: the payment stays unresolved (and blocks a new
   * push) until the provider reports a final result, which is then applied
   * exactly like a callback. Queries for one payment are spaced by
   * payments.stkQueryIntervalSeconds. Returns the STK status afterwards.
   */
  async resolvePending(paymentId: string): Promise<StkStatus | null> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      return null;
    }
    const status = this.stkStatus(payment);
    if (status !== StkStatus.TIMEOUT) {
      return status;
    }
    const legs = await this.transactions.find({ where: { paymentId } });
    const reference = legs[0]?.mpesaReference;
    const checkout = legs
      .map((l) => (l.rawCallback?.stkPush as { checkoutRequestId?: string } | undefined)?.checkoutRequestId)
      .find((id): id is string => typeof id === 'string' && id.length > 0);
    if (!reference || !checkout) {
      return status;
    }
    const interval = this.config.get<number>('payments.stkQueryIntervalSeconds', 30);
    if (!(await this.redis.setIfAbsent(`stk-query:${paymentId}`, '1', interval))) {
      return status;
    }
    const result = await this.stk.query(checkout);
    if (result.state === 'pending') {
      return status;
    }
    await this.handleCallback({
      reference,
      resultCode: result.state === 'success' ? 0 : Math.max(result.resultCode ?? 1, 1),
      resultDesc: result.resultDesc ?? undefined,
      mpesaType: 'STK',
    });
    const after = await this.payments.findOne({ where: { id: paymentId } });
    return after ? this.stkStatus(after) : null;
  }

  /**
   * Reconcile step for the scheduled job: tries to resolve every payment
   * still pending past the STK timeout (and younger than `maxAgeHours`).
   * Returns how many reached a final status.
   */
  async resolveTimedOut(now: Date = new Date(), maxAgeHours = 24, limit = 50): Promise<number> {
    const timeout = this.config.get<number>('payments.stkTimeoutSeconds', 120);
    const rows = await this.payments.find({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: LessThanOrEqual(new Date(now.getTime() - timeout * 1000)),
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    let resolved = 0;
    for (const row of rows) {
      if (row.createdAt.getTime() < now.getTime() - maxAgeHours * 3_600_000) {
        continue;
      }
      try {
        const out = await this.resolvePending(row.id);
        if (out === StkStatus.SUCCESS || out === StkStatus.FAILED) {
          resolved += 1;
        }
      } catch (err) {
        this.logger.warn(
          `STK query for payment ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return resolved;
  }

  private async confirmErrandAfterPayment(errandId: string): Promise<void> {
    const errand = await this.errands.getById(errandId);
    if (errand.status === ErrandStatus.CANCELLED) {
      // Cancelled meanwhile: the cancellation backstop refreshes the review.
      await this.refunds.openIfPaid(errandId, RefundTrigger.CANCELLED_AFTER_PAYMENT);
      return;
    }
    if (!ErrandStateMachine.canTransition(errand.status, ErrandStatus.PAYMENT_CONFIRMED)) {
      this.logger.warn(
        `Payment confirmed but errand ${errandId} is ${errand.status}; no transition.`,
      );
      return;
    }
    await this.errands.transition(
      errandId,
      ErrandStatus.PAYMENT_CONFIRMED,
      { type: StatusHistoryActor.SYSTEM },
      'Payment confirmed via STK callback',
    );
  }

  async settleErrand(errandId: string, _actor: AuthContext): Promise<{
    errandId: string;
    settled: boolean;
    released: PaymentTransaction[];
    previousStatus: string;
  }> {
    const errand = await this.errands.getById(errandId);
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (errand.status === ErrandStatus.SETTLED) {
      const prior = await this.transactions.find({
        where: { paymentId: (await this.payments.findOne({ where: { errandId } }))?.id ?? '', status: PaymentTransactionStatus.COMPLETED },
      });
      return { errandId, settled: true, released: prior, previousStatus: ErrandStatus.SETTLED };
    }
    if (errand.status === ErrandStatus.DISPUTED) {
      throw new ConflictException('Disputed errands are locked; resolve the dispute first');
    }
    if (!ErrandStateMachine.canTransition(errand.status, ErrandStatus.SETTLED)) {
      throw new ConflictException(`Cannot settle from ${errand.status}`);
    }
    const payment = await this.payments.findOne({ where: { errandId } });
    if (!payment) {
      throw new ConflictException('No payment to settle');
    }
    const legs = await this.transactions.find({ where: { paymentId: payment.id } });
    const incomplete = legs.filter(
      (t) => t.status !== PaymentTransactionStatus.COMPLETED,
    );
    if (incomplete.length > 0) {
      throw new ConflictException(
        `Cannot settle: ${incomplete.length} payment leg(s) not completed ` +
          `(${incomplete.map((t) => `${t.paymentTypeId}:${t.status}`).join(', ')}).`,
      );
    }
    const released = await this.transactions.save(
      legs.map((l) => this.transactions.merge(l, { status: PaymentTransactionStatus.COMPLETED })),
    );
    await this.errands.transition(
      errandId,
      ErrandStatus.SETTLED,
      { type: StatusHistoryActor.SYSTEM },
      `Settled: runner earnings recorded for payout (${released.length} legs).`,
    );
    return { errandId, settled: true, released, previousStatus: errand.status as string };
  }

  async listForErrand(errandId: string, user: AuthContext): Promise<{
    payment: Payment | null;
    transactions: PaymentTransaction[];
    stkStatus: StkStatus | null;
    merchantPayment: MerchantPaymentView | null;
    differencePayments: DifferencePaymentView[];
  }> {
    if (user.role !== 'admin') {
      const customer = await this.customers.findOne({ where: { userId: user.userId } });
      const errand = await this.errands.getById(errandId);
      if (!customer || !errand || errand.customerId !== customer.id) {
        throw new ForbiddenException('Cannot view this payment');
      }
    }
    let payment = await this.primaryPayment(errandId);
    if (payment && this.stkStatus(payment) === StkStatus.TIMEOUT) {
      // Best effort: ask the provider before answering (row 52).
      const timedOutId = payment.id;
      try {
        await this.resolvePending(timedOutId);
        payment = await this.primaryPayment(errandId);
      } catch (err) {
        this.logger.warn(
          `STK query for payment ${timedOutId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!payment) {
      return {
        payment: null,
        transactions: [],
        stkStatus: null,
        merchantPayment: null,
        differencePayments: [],
      };
    }
    const transactions = await this.transactions.find({
      where: { paymentId: payment.id },
    });
    return {
      payment,
      transactions,
      stkStatus: this.stkStatus(payment),
      merchantPayment: await this.merchantPaymentFor(payment),
      differencePayments: await this.differencesFor(errandId),
    };
  }
}

const newReference = (): string =>
  `NTM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const errandIdOf = (payment: Payment): string => payment.errandId;