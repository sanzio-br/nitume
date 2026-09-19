import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentFlow,
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
   * Initiates the customer-to-platform charge (service_fee + runner_fee via a
   * single STK push; the two ledger transactions share one M-Pesa reference).
   * The merchant amount (budget) is recorded for the merchant_direct flow but
   * is settled outside this charge. v1: mock push, so the client "pays" by
   * POSTing the returned reference to the public /payments/mpesa/callback.
   */
  async initiate(
    errandId: string,
    user: AuthContext,
  ): Promise<{
    payment: Payment;
    reference: string;
    checkoutRequestId: string;
    transactions: PaymentTransaction[];
  }> {
    const customer = await this.customers.findOne({ where: { userId: user.userId } });
    if (!customer) {
      throw new ForbiddenException('Customer profile not found');
    }
    const errand = await this.errands.getById(errandId);
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (errand.customerId !== customer.id) {
      throw new ForbiddenException('Errand belongs to another customer');
    }
    if (!ErrandStateMachine.canTransition(errand.status, ErrandStatus.PAYMENT_CONFIRMED)) {
      throw new ConflictException(`Errand is not payable now (${errand.status})`);
    }
    if (errand.quotedPrice === null) {
      throw new BadRequestException('Errand has not been quoted yet');
    }

    const existing = await this.payments.findOne({ where: { errandId } });
    if (existing && existing.status === PaymentStatus.COMPLETED) {
      const tx = await this.transactions.find({ where: { paymentId: existing.id } });
      return {
        payment: existing,
        reference: tx[0]?.mpesaReference ?? 'PAID',
        checkoutRequestId: 'PAID',
        transactions: tx,
      };
    }
    if (existing && existing.status === PaymentStatus.PENDING) {
      const tx = await this.transactions.find({ where: { paymentId: existing.id } });
      return {
        payment: existing,
        reference: tx[0]?.mpesaReference ?? '',
        checkoutRequestId: 'PENDING',
        transactions: tx,
      };
    }
// A previously failed payment is superseded by a fresh one below.
    const quote = Number(errand.quotedPrice);
    const serviceFeeRate = this.config.get<number>('pricing.serviceFeeRate', 0.2);
    const runnerFeeRate = this.config.get<number>('pricing.runnerFeeRate', 0.3);
    const serviceFee = round2(quote * serviceFeeRate);
    const runnerFee = round2(quote * runnerFeeRate);
    const budget = Number(errand.budget);
    const merchantAmount = budget > 0 ? round2(budget) : 0;
    const flow = merchantAmount > 0 ? PaymentFlow.MERCHANT_DIRECT : PaymentFlow.PLATFORM_ONLY;

    const reference = `NTM-${Date.now().toString(36).toUpperCase()}`;

    const payment = await this.payments.save(
      this.payments.create({
        errandId,
        serviceFee: serviceFee.toFixed(2),
        runnerFee: runnerFee.toFixed(2),
        merchantAmount: merchantAmount.toFixed(2),
        paymentFlow: flow,
        status: PaymentStatus.PENDING,
      }),
    );

    const [serviceFeeType, runnerFeeType] = await Promise.all([
      this.paymentTypes.findOne({ where: { code: PaymentTypeCode.SERVICE_FEE } }),
      this.paymentTypes.findOne({ where: { code: PaymentTypeCode.RUNNER_FEE } }),
    ]);
    if (!serviceFeeType || !runnerFeeType) {
      throw new Error('payment_type reference data is not seeded');
    }

    const txRows = await this.transactions.save([
      this.transactions.create({
        paymentId: payment.id,
        paymentTypeId: serviceFeeType.id,
        mpesaReference: reference,
        amount: serviceFee.toFixed(2),
        status: PaymentTransactionStatus.INITIATED,
      }),
      this.transactions.create({
        paymentId: payment.id,
        paymentTypeId: runnerFeeType.id,
        mpesaReference: reference,
        amount: runnerFee.toFixed(2),
        status: PaymentTransactionStatus.INITIATED,
      }),
    ]);

    const push = await this.stk.push({
      phone: user.phone,
      amountKes: (serviceFee + runnerFee).toFixed(2),
      reference,
      description: `Nitume errand ${errandId}`,
    });

    return { payment, reference, checkoutRequestId: push.checkoutRequestId, transactions: txRows };
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
    // eslint-disable-next-line no-misused-spread -- DTO → plain JSON callback payload
    await this.transactions.save(
      rows.map((r) =>
        this.transactions.merge(r, {
          status,
          // eslint-disable-next-line no-misused-spread -- DTO → plain JSON
          rawCallback: { ...dto, ts: new Date().toISOString() },
        }),
      ),
    );

    if (success) {
      await this.payments.update(payment.id, { status: PaymentStatus.COMPLETED });
      await this.confirmErrandAfterPayment(errandIdOf(payment));
    } else {
      await this.payments.update(payment.id, { status: PaymentStatus.FAILED });
    }
  }

  private async confirmErrandAfterPayment(errandId: string): Promise<void> {
    const errand = await this.errands.getById(errandId);
    if (!errand || !ErrandStateMachine.canTransition(errand.status, ErrandStatus.PAYMENT_CONFIRMED)) {
      this.logger.warn(
        `Payment confirmed but errand ${errandId} is ${errand?.status} — ` +
          `no transition (handled by support/refund flow).`,
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

  async listForErrand(errandId: string, user: AuthContext): Promise<{
    payment: Payment | null;
    transactions: PaymentTransaction[];
  }> {
    if (user.role !== 'admin') {
      const customer = await this.customers.findOne({ where: { userId: user.userId } });
      const errand = await this.errands.getById(errandId);
      if (!customer || !errand || errand.customerId !== customer.id) {
        throw new ForbiddenException('Cannot view this payment');
      }
    }
    const payment = await this.payments.findOne({ where: { errandId } });
    if (!payment) {
      return { payment: null, transactions: [] };
    }
    const transactions = await this.transactions.find({
      where: { paymentId: payment.id },
    });
    return { payment, transactions };
  }
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const errandIdOf = (payment: Payment): string => payment.errandId;