import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
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
import { feesFor } from '../common/fees';
import { PAYMENT_TYPES } from './payment-type.reference';
import { MPESA_PROVIDER } from './providers/mpesa-provider.factory';
import {
  MpesaProvider,
  ProviderPaymentRef,
  StkInitiateResult,
  StkQueryResult,
} from './providers/mpesa-provider';
import { MAINTENANCE_QUEUE, PAYMENT_VERIFY_JOB } from '../infra/queue/queues';
import { ApiError, conflict } from '../common/api-error';
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
  /** Provider reason when the charge FAILED, else null. */
  failureReason: string | null;
  /** Set right after a push; null on later reads. */
  checkoutRequestId: string | null;
  merchantPayment: MerchantPaymentView | null;
}

/**
 * Provider reason of a FAILED charge (Daraja ResultDesc, e.g. "Request
 * cancelled by user"), or null.
 */
export const failureReasonOf = (
  payment: Pick<Payment, 'status'>,
  legs: Pick<PaymentTransaction, 'rawCallback'>[],
): string | null => {
  if (payment.status !== PaymentStatus.FAILED) {
    return null;
  }
  const reason = legs
    .map((l) => l.rawCallback?.resultDesc)
    .find((d): d is string => typeof d === 'string' && d.length > 0);
  return reason ?? null;
};

export interface InitiateResult {
  payment: Payment;
  /** Provider reason when the charge FAILED, else null. */
  failureReason: string | null;
  /** True once the merchant/admin has set Till/Paybill details on the errand. */
  merchantDetailsAvailable: boolean;
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
export class PaymentsService implements OnApplicationBootstrap, OnModuleInit {
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
    @Inject(MPESA_PROVIDER)
    private readonly provider: MpesaProvider,
    private readonly config: ConfigService,
    private readonly accounts: CustomerAccountsService,
    private readonly refunds: RefundsService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    @InjectQueue(MAINTENANCE_QUEUE)
    private readonly maintenance?: Queue,
  ) {}

  /**
   * A re-quote (row 72) is refused while the errand's main payment is
   * pending or paid: the customer would otherwise be charged for a quote
   * that no longer applies. A FAILED payment does not block it.
   */
  onModuleInit(): void {
    this.errands.onRequote(async (manager, errandId) => {
      const active = await manager.getRepository(Payment).findOne({
        where: { errandId, priceChangeRequestId: IsNull(), status: Not(PaymentStatus.FAILED) },
      });
      if (active) {
        throw conflict(
          'payment_in_progress',
          'The customer has already started paying this quote; it cannot be replaced now',
          { paymentId: active.id, paymentStatus: active.status },
        );
      }
    });
  }

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
      throw conflict('errand_not_payable', `Errand is not payable now (${errand.status})`, {
        status: errand.status,
      });
    }
    if (errand.quotedPrice === null) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'errand_not_quoted', 'Errand has not been quoted yet');
    }
    // Only the newest quote is payable, unexpired (row 46: 409 quote_expired)
    // and accepted by the customer (row 72: 409 quote_not_accepted).
    // Checked again under the errand lock inside the transaction below.
    await this.errands.payableQuote(errandId);
    const rates = {
      serviceFeeRate: this.config.get<number>('pricing.serviceFeeRate', 0.2),
      runnerFeeRate: this.config.get<number>('pricing.runnerFeeRate', 0.3),
    };
    const budget = Number(errand.budget);
    const merchantAmount = budget > 0 ? round2(budget) : 0;
    const flow = await this.flowFor(errandId, merchantAmount, opts.merchantRoute);
    const phone = await this.payerPhone(user, opts.paymentMethodId);

    const reference = newReference();
    // send_to_runner is platform-mediated (rows 42, 48): the purchase amount
    // joins the same STK charge to Nitume as a merchant_payment leg.
    const collectMerchant = flow === PaymentFlow.CUSTOMER_TO_RUNNER && merchantAmount > 0;

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
    let chargeKes: number;
    try {
      ({ payment, txRows, chargeKes } = await this.payments.manager.transaction(async (manager) => {
        const quote = await this.errands.payableQuote(errandId, manager);
        const { serviceFee, runnerFee } = feesFor(Number(quote.total), rates);
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
        const charge = serviceFee + runnerFee + (collectMerchant ? merchantAmount : 0);
        return { payment: saved, txRows: legs, chargeKes: charge };
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

    const push = await this.provider.initiateStk({
      phone,
      amountKes: round2(chargeKes).toFixed(2),
      reference,
      description: `Nitume errand ${errand.reference ?? errandId}`,
      customerName: (await this.users.findById(user.userId))?.displayName ?? null,
    });
    await this.rememberCheckout(txRows, push);

    return {
      payment,
      failureReason: null,
      merchantDetailsAvailable: await this.hasMerchantDetails(errandId),
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
      failureReason: failureReasonOf(payment, tx),
      merchantDetailsAvailable: await this.hasMerchantDetails(payment.errandId),
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

  /**
   * Merchant route of the task's primary (non-difference, non-failed)
   * payment, or null when there is none or it carries no merchant amount.
   * Decrease refund reviews open only for send_to_runner (row 86).
   */
  async primaryRouteFor(errandId: string, manager?: EntityManager): Promise<MerchantRoute | null> {
    const repo = manager ? manager.getRepository(Payment) : this.payments;
    const primary = await repo.findOne({
      where: { errandId, priceChangeRequestId: IsNull(), status: Not(PaymentStatus.FAILED) },
      order: { createdAt: 'DESC' },
    });
    return primary ? routeOf(primary.paymentFlow) : null;
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
      const push = await this.provider.initiateStk({
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
      failureReason: failureReasonOf(payment, transactions),
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
    push: StkInitiateResult,
  ): Promise<void> {
    if (legs.length === 0) {
      return;
    }
    const stkPush = {
      checkoutRequestId: push.checkoutRequestId,
      merchantRequestId: push.merchantRequestId ?? null,
      providerReference: push.providerReference ?? null,
      gateway: this.provider.name,
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

  private async hasMerchantDetails(errandId: string): Promise<boolean> {
    return (await this.merchantDetailsFor(errandId)) !== null;
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
   * Provider callback (POST /payments/mpesa/callback). The active provider
   * parses the body (400 `callback_unrecognised` when it cannot):
   * - console mock (trusted, dev/e2e): the result is applied at once.
   * - real providers (PayHero): the callback is never trusted. It only names
   *   the payment, which a `payment-verify` job on the maintenance queue
   *   confirms with the provider's status query before anything is marked
   *   paid (row 73). Unknown payments are 404.
   * Idempotent: callbacks for an already-final payment are dropped.
   */
  async handleCallback(body: unknown): Promise<void> {
    const parsed = this.provider.parseCallback(body);
    if (!parsed) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'callback_unrecognised',
        'Callback body not recognised for this payment provider',
      );
    }
    const rows = await this.legsFor(parsed);
    if (rows.length === 0) {
      throw new NotFoundException('Unknown payment reference');
    }
    const payment = await this.payments.findOne({ where: { id: rows[0].paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }
    if (parsed.trusted) {
      await this.applyResult(payment, rows, parsed.claimed, 'callback');
      return;
    }
    if (isFinal(rows)) {
      return;
    }
    await this.queueVerification(payment.id, parsed.claimed.state);
  }

  /** Transaction legs a callback refers to: by our reference, else by provider ids. */
  private async legsFor(parsed: {
    reference: string | null;
    checkoutRequestId: string | null;
    providerReference: string | null;
  }): Promise<PaymentTransaction[]> {
    if (parsed.reference) {
      const rows = await this.transactions.find({ where: { mpesaReference: parsed.reference } });
      if (rows.length > 0) {
        return rows;
      }
    }
    const ids = [parsed.checkoutRequestId, parsed.providerReference].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    if (ids.length === 0) {
      return [];
    }
    const match = await this.transactions
      .createQueryBuilder('t')
      .where(`t."rawCallback"->'stkPush'->>'checkoutRequestId' IN (:...ids)`, { ids })
      .orWhere(`t."rawCallback"->'stkPush'->>'providerReference' IN (:...ids)`, { ids })
      .getOne();
    return match ? this.transactions.find({ where: { paymentId: match.paymentId } }) : [];
  }

  /**
   * Queues the provider confirmation of a payment. If the queue is down the
   * STK reconcile job still resolves it once it times out.
   */
  private async queueVerification(paymentId: string, claimed: StkQueryResult['state']): Promise<void> {
    if (!this.maintenance) {
      return;
    }
    try {
      await this.maintenance.add(PAYMENT_VERIFY_JOB, { paymentId, claimed });
    } catch (err) {
      this.logger.error(
        `Could not queue verification of payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Records a final provider result on the payment and its legs, then moves
   * the errand (main payment) or opens the refund review (cancelled task).
   * Dropped when every leg is already final.
   */
  private async applyResult(
    payment: Payment,
    rows: PaymentTransaction[],
    result: StkQueryResult,
    source: 'callback' | 'query',
  ): Promise<void> {
    if (result.state === 'pending') {
      return;
    }
    if (isFinal(rows)) {
      this.logger.warn(`Dropping duplicate result for payment ${payment.id} (final=${rows[0].status})`);
      return;
    }
    const success = result.state === 'success';
    const status = success ? PaymentTransactionStatus.COMPLETED : PaymentTransactionStatus.FAILED;
    const errandId = errandIdOf(payment);
    // A payment that completes after the task was cancelled opens its refund
    // review in the same transaction that records the completed legs, so a
    // failure cannot leave paid legs without a review (a retried result is
    // dropped as already final).
    const cancelled =
      success && (await this.errands.getById(errandId)).status === ErrandStatus.CANCELLED;
    const outcome = {
      resultCode: success ? 0 : Math.max(result.resultCode ?? 1, 1),
      resultDesc: result.resultDesc ?? undefined,
      receiptNumber: result.receiptNumber ?? undefined,
      provider: this.provider.name,
      source,
    };
    await this.payments.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(PaymentTransaction);
      await txRepo.save(
        rows.map((r) =>
          txRepo.merge(r, {
            status,
            // Keeps the push ids (`stkPush`) next to the provider result.
            rawCallback: { ...r.rawCallback, ...outcome, ts: new Date().toISOString() },
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

  /** What the provider needs to look a payment's push up. */
  private providerRefOf(legs: PaymentTransaction[]): ProviderPaymentRef | null {
    const reference = legs[0]?.mpesaReference;
    if (!reference) {
      return null;
    }
    const pushes = legs.map(
      (l) =>
        (l.rawCallback?.stkPush ?? {}) as { checkoutRequestId?: string; providerReference?: string },
    );
    const first = (key: 'checkoutRequestId' | 'providerReference') =>
      pushes.map((p) => p[key]).find((v): v is string => typeof v === 'string' && v.length > 0) ??
      null;
    return {
      reference,
      checkoutRequestId: first('checkoutRequestId'),
      providerReference: first('providerReference'),
    };
  }

  /**
   * Confirms a pending payment with the provider's status query and applies
   * a final result. Used by the `payment-verify` job after a callback and by
   * the TIMEOUT reconcile. Returns the provider state; `pending` leaves the
   * payment unresolved.
   */
  async verifyPayment(paymentId: string): Promise<StkQueryResult['state'] | null> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      return null;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      return payment.status === PaymentStatus.FAILED ? 'failed' : 'success';
    }
    const legs = await this.transactions.find({ where: { paymentId } });
    const ref = this.providerRefOf(legs);
    if (!ref || (!ref.checkoutRequestId && !ref.providerReference)) {
      return 'pending';
    }
    const result = await this.provider.queryStatus(ref);
    await this.applyResult(payment, legs, result, 'query');
    return result.state;
  }

  /**
   * Resolves a TIMEOUT payment with the provider (status query, row 52).
   * TIMEOUT is not FAILED: the payment stays unresolved (and blocks a new
   * push) until the provider reports a final result. Queries for one payment
   * are spaced by payments.stkQueryIntervalSeconds. Returns the STK status
   * afterwards.
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
    const interval = this.config.get<number>('payments.stkQueryIntervalSeconds', 30);
    if (!(await this.redis.setIfAbsent(`stk-query:${paymentId}`, '1', interval))) {
      return status;
    }
    const state = await this.verifyPayment(paymentId);
    if (state === 'pending' || state === null) {
      return status;
    }
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

  /**
   * System step CONFIRMED -> SETTLED: the errand's main payment must have
   * every leg completed; the runner's earnings then become payable through
   * the payout ledger. Idempotent on an already SETTLED errand.
   */
  async settleErrand(errandId: string): Promise<{
    errandId: string;
    settled: boolean;
    released: PaymentTransaction[];
    previousStatus: string;
  }> {
    const errand = await this.errands.getById(errandId);
    const payment = await this.activePrimaryPayment(errandId);
    if (errand.status === ErrandStatus.SETTLED) {
      const prior = payment
        ? await this.transactions.find({
            where: { paymentId: payment.id, status: PaymentTransactionStatus.COMPLETED },
          })
        : [];
      return { errandId, settled: true, released: prior, previousStatus: ErrandStatus.SETTLED };
    }
    if (errand.status === ErrandStatus.DISPUTED) {
      throw conflict('errand_disputed', 'Disputed errands are locked; resolve the dispute first');
    }
    if (!ErrandStateMachine.canTransition(errand.status, ErrandStatus.SETTLED)) {
      throw conflict('errand_not_settleable', `Cannot settle from ${errand.status}`, {
        status: errand.status,
      });
    }
    if (!payment) {
      throw conflict('no_payment_to_settle', 'No payment to settle');
    }
    const legs = await this.transactions.find({ where: { paymentId: payment.id } });
    const incomplete = legs.filter((t) => t.status !== PaymentTransactionStatus.COMPLETED);
    if (incomplete.length > 0) {
      throw conflict(
        'payment_legs_incomplete',
        `Cannot settle: ${incomplete.length} payment leg(s) not completed ` +
          `(${incomplete.map((t) => `${t.paymentTypeId}:${t.status}`).join(', ')}).`,
      );
    }
    await this.errands.transition(
      errandId,
      ErrandStatus.SETTLED,
      { type: StatusHistoryActor.SYSTEM },
      `Settled: runner earnings recorded for payout (${legs.length} legs).`,
    );
    return { errandId, settled: true, released: legs, previousStatus: errand.status as string };
  }

  /**
   * Settles every CONFIRMED errand (dispute-window job, rows 26, 50).
   * Errands that cannot settle yet are logged and retried on the next run.
   */
  async settleConfirmed(limit = 100): Promise<string[]> {
    const settled: string[] = [];
    for (const id of await this.errands.idsInStatus(ErrandStatus.CONFIRMED, limit)) {
      try {
        await this.settleErrand(id);
        settled.push(id);
      } catch (err) {
        this.logger.warn(
          `Could not settle errand ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return settled;
  }

  async listForErrand(errandId: string, user: AuthContext): Promise<{
    payment: Payment | null;
    transactions: PaymentTransaction[];
    stkStatus: StkStatus | null;
    failureReason: string | null;
    merchantDetailsAvailable: boolean;
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
        failureReason: null,
        merchantDetailsAvailable: await this.hasMerchantDetails(errandId),
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
      failureReason: failureReasonOf(payment, transactions),
      merchantDetailsAvailable: await this.hasMerchantDetails(errandId),
      merchantPayment: await this.merchantPaymentFor(payment),
      differencePayments: await this.differencesFor(errandId),
    };
  }
}

const newReference = (): string =>
  `NTM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const errandIdOf = (payment: Payment): string => payment.errandId;

const isFinal = (rows: PaymentTransaction[]): boolean =>
  rows.every(
    (r) =>
      r.status === PaymentTransactionStatus.COMPLETED || r.status === PaymentTransactionStatus.FAILED,
  );