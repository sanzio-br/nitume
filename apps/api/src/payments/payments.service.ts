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
import { EntityManager, IsNull, Not, Repository } from 'typeorm';
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

    const reference = `NTM-${Date.now().toString(36).toUpperCase()}`;

    const [serviceFeeType, runnerFeeType] = await Promise.all([
      this.paymentTypes.findOne({ where: { code: PaymentTypeCode.SERVICE_FEE } }),
      this.paymentTypes.findOne({ where: { code: PaymentTypeCode.RUNNER_FEE } }),
    ]);
    if (!serviceFeeType || !runnerFeeType) {
      throw new Error('payment_type reference data is not seeded');
    }

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
        const legs = await txRepo.save([
          txRepo.create({
            paymentId: saved.id,
            paymentTypeId: serviceFeeType.id,
            mpesaReference: reference,
            amount: serviceFee.toFixed(2),
            status: PaymentTransactionStatus.INITIATED,
          }),
          txRepo.create({
            paymentId: saved.id,
            paymentTypeId: runnerFeeType.id,
            mpesaReference: reference,
            amount: runnerFee.toFixed(2),
            status: PaymentTransactionStatus.INITIATED,
          }),
        ]);
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
      amountKes: (serviceFee + runnerFee).toFixed(2),
      reference,
      description: `Nitume errand ${errand.reference ?? errandId}`,
    });

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
   * Records the merchant/item price difference of an approved price change
   * (no service or runner fee) on the same merchant route as the original
   * merchant amount, and tells the customer how to pay it. No STK push: the
   * merchant amount never goes through Nitume's charge (owner question on
   * how the difference is collected). Errands without a merchant amount so
   * far need `route` (merchant_route_required). Pass `manager` to write the
   * record inside the caller's transaction (price-change approval).
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
      where: { errandId, priceChangeRequestId: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const primaryRoute = primary ? routeOf(primary.paymentFlow) : null;
    const flow = primaryRoute
      ? ROUTE_TO_FLOW[primaryRoute]
      : await this.flowFor(errandId, difference, route);
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
    return { payment, merchantPayment: await this.merchantPaymentFor(payment) };
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
   * Merchant Till/Paybill details for an errand, or null when none exist.
   * No source exists yet: where these details come from (and when) is an
   * open owner question (SQ-6), so merchant_direct is refused until then.
   */
  merchantDetailsFor(_errandId: string): Promise<MerchantDetails | null> {
    return Promise.resolve(null);
  }

  private async merchantPaymentFor(payment: Payment): Promise<MerchantPaymentView | null> {
    const route = routeOf(payment.paymentFlow);
    if (!route) {
      return null;
    }
    if (route === MerchantRoute.SEND_TO_RUNNER) {
      return { route, amount: payment.merchantAmount };
    }
    const details = await this.merchantDetailsFor(payment.errandId);
    return {
      route,
      amount: payment.merchantAmount,
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
            // eslint-disable-next-line no-misused-spread -- DTO → plain JSON
            rawCallback: { ...dto, ts: new Date().toISOString() },
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

    if (success && !cancelled) {
      await this.confirmErrandAfterPayment(errandId);
    }
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
  }> {
    if (user.role !== 'admin') {
      const customer = await this.customers.findOne({ where: { userId: user.userId } });
      const errand = await this.errands.getById(errandId);
      if (!customer || !errand || errand.customerId !== customer.id) {
        throw new ForbiddenException('Cannot view this payment');
      }
    }
    const payment = await this.primaryPayment(errandId);
    if (!payment) {
      return { payment: null, transactions: [], stkStatus: null, merchantPayment: null };
    }
    const transactions = await this.transactions.find({
      where: { paymentId: payment.id },
    });
    return {
      payment,
      transactions,
      stkStatus: this.stkStatus(payment),
      merchantPayment: await this.merchantPaymentFor(payment),
    };
  }
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const errandIdOf = (payment: Payment): string => payment.errandId;