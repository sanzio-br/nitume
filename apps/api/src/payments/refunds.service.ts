import { HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import {
  ErrandCategory,
  ErrandStatus,
  PaymentFlow,
  PaymentMethodType,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTypeCode,
} from '../common/enums';
import { CustomerAccountsService } from '../customers/customer-accounts.service';
import { CustomersService } from '../customers/customers.service';
import { TransitionGuard } from '../errands/errand-state-machine';
import { ErrandsService, REFUNDABLE_TERMINAL_STATUSES } from '../errands/errands.service';
import { UsersService } from '../users/users.service';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentType } from './payment-type.entity';
import { Payment } from './payment.entity';
import { RefundPayoutCorrection, RefundPayoutCorrectionKind } from './refund-payout-correction.entity';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';

/** What the customer sees of a refund review (no admin notes or user ids). */
export interface CustomerRefundView {
  id: string;
  errandId: string;
  /** Why the review opened, e.g. `price_change_decrease` (row 71). */
  trigger: RefundTrigger;
  /** Set on a price-decrease review: the approved price-change request. */
  priceChangeRequestId: string | null;
  /**
   * pending_review | approved | no_refund | refunded. Follows the effective
   * payout (row 100): a refunded review whose payout was reversed and not
   * yet re-sent shows `approved` again.
   */
  status: RefundStatus;
  /**
   * This review's own basis: everything the customer paid by STK for the
   * task (cancellation review) or the decrease (price-decrease review). The
   * effective ceiling is also bounded by `remainingRefundable` (row 87).
   */
  amountPaid: string;
  /**
   * Null until an admin decides. Once refunded, the effective amount sent
   * (after corrections, row 100); while a reversal is not re-sent, the
   * approved amount.
   */
  refundAmount: string | null;
  /**
   * What can still be refunded on the whole task (row 87): total paid to
   * Nitume minus every approved/refunded review's refund amount.
   */
  remainingRefundable: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** Time of the latest sent payout (original or re-sent); null while reversed. */
  paidAt: Date | null;
}

/**
 * Effective payout of a refunded review (row 100): the original payout with
 * its corrections applied in order. `reference` is null and `amount` "0.00"
 * while reversed; `at` is the time of the latest sent payout (original
 * `paidAt` or the latest `resent`), or of the reversal while reversed.
 */
export interface EffectivePayout {
  state: 'sent' | 'reversed';
  amount: string;
  reference: string | null;
  at: Date | null;
}

type CorrectionStep = Pick<RefundPayoutCorrection, 'kind' | 'newReference' | 'newAmount' | 'createdAt'>;

/** Pure: effective payout of a review from its corrections, oldest first; null unless refunded. */
export const effectivePayoutOf = (
  row: Pick<RefundReview, 'status' | 'payoutReference' | 'refundAmount' | 'paidAt'>,
  corrections: CorrectionStep[] = [],
): EffectivePayout | null => {
  if (row.status !== RefundStatus.REFUNDED) {
    return null;
  }
  const out: EffectivePayout = {
    state: 'sent',
    amount: Number(row.refundAmount ?? 0).toFixed(2),
    reference: row.payoutReference,
    at: row.paidAt,
  };
  for (const c of corrections) {
    switch (c.kind) {
      case RefundPayoutCorrectionKind.CORRECTED:
        out.reference = c.newReference ?? out.reference;
        out.amount = c.newAmount !== null ? Number(c.newAmount).toFixed(2) : out.amount;
        break;
      case RefundPayoutCorrectionKind.REVERSED:
        out.state = 'reversed';
        out.amount = '0.00';
        out.reference = null;
        out.at = c.createdAt;
        break;
      case RefundPayoutCorrectionKind.RESENT:
        out.state = 'sent';
        out.amount = Number(c.newAmount ?? row.refundAmount ?? 0).toFixed(2);
        out.reference = c.newReference;
        out.at = c.createdAt;
        break;
    }
  }
  return out;
};

/**
 * What a review commits against the task's cumulative cap (row 87, row 100):
 * approved → the decided amount; refunded → the effective amount sent, or
 * the decided amount again while a reversal is not re-sent (it is owed).
 */
const committedAmountOf = (
  row: Pick<RefundReview, 'status' | 'refundAmount' | 'payoutReference' | 'paidAt'>,
  corrections: CorrectionStep[] = [],
): string | null => {
  const payout = effectivePayoutOf(row, corrections);
  return payout && payout.state === 'sent' ? payout.amount : row.refundAmount;
};

/** One correction as the admin sees it (row 100), oldest first. */
export interface RefundPayoutCorrectionView {
  id: string;
  kind: RefundPayoutCorrectionKind;
  previousReference: string | null;
  previousAmount: string;
  newReference: string | null;
  newAmount: string | null;
  reason: string;
  createdByUserId: string;
  /** Admin name (N-2). */
  createdBy: AdminRef;
  createdAt: Date;
}

/** Input of `addCorrection` (POST /refunds/:id/corrections). */
export interface PayoutCorrectionInput {
  kind: RefundPayoutCorrectionKind;
  newReference?: string | null;
  newAmount?: number | null;
  reason: string;
  /** Latest correction id the admin saw (null: none); stale → 409 payout_correction_conflict. */
  expectedLatestCorrectionId: string | null;
}

/** Reason length after trimming (spec drawer-refund "Corrections"). */
export const CORRECTION_REASON_MIN_LENGTH = 5;
export const CORRECTION_REASON_MAX_LENGTH = 500;

/**
 * Cumulative refund position of one review on its task (rows 81, 87).
 * Cumulative refunds can never exceed what the customer paid to Nitume.
 */
export interface RefundPosition {
  /** Every completed STK amount paid to Nitume for the task (fees, item, differences). */
  totalPaidToNitume: string;
  /** Refund amounts of the task's OTHER approved/refunded reviews. */
  alreadyRefunded: string;
  /** totalPaidToNitume minus every approved/refunded refund on the task (this one included). */
  remainingRefundable: string;
  /**
   * Highest refund an admin may approve on this review now:
   * min(amountPaid, totalPaidToNitume - alreadyRefunded), never below 0.
   * Null once the review is decided.
   */
  refundCeiling: string | null;
}

const COMMITTED = new Set<RefundStatus>([RefundStatus.APPROVED, RefundStatus.REFUNDED]);

/** Pure ceiling maths for one review given the task's reviews and total paid. */
export const refundPositionOf = (
  row: Pick<RefundReview, 'id' | 'status' | 'amountPaid' | 'refundAmount'>,
  totalPaid: number,
  siblings: Pick<RefundReview, 'id' | 'status' | 'refundAmount'>[],
): RefundPosition => {
  const committed = (r: Pick<RefundReview, 'status' | 'refundAmount'>): number =>
    COMMITTED.has(r.status) ? Number(r.refundAmount ?? 0) : 0;
  const others = siblings.filter((r) => r.id !== row.id).reduce((sum, r) => sum + committed(r), 0);
  const all = others + committed(row);
  return {
    totalPaidToNitume: totalPaid.toFixed(2),
    alreadyRefunded: others.toFixed(2),
    remainingRefundable: Math.max(0, totalPaid - all).toFixed(2),
    refundCeiling:
      row.status === RefundStatus.PENDING_REVIEW
        ? Math.max(0, Math.min(Number(row.amountPaid), totalPaid - others)).toFixed(2)
        : null,
  };
};

/** Errand summary on admin refund items (N-1). */
export interface RefundErrandSummary {
  id: string;
  reference: string;
  title: string | null;
  description: string;
  category: ErrandCategory;
  status: ErrandStatus;
}

/** An admin who decided or paid out a refund (N-2). */
export interface AdminRef {
  id: string;
  displayName: string | null;
}

/**
 * Admin view of a review: the row plus its cumulative position (row 87) and
 * its effective payout (row 100; null unless refunded). `payoutReference`,
 * `paidAt` and `paidByUserId` stay the original, immutable payout.
 */
export type AdminRefundReview = RefundReview & RefundPosition & { effectivePayout: EffectivePayout | null };

/** Admin list item: the review plus errand summary and admin names. */
export type AdminRefundItem = AdminRefundReview & {
  errand: RefundErrandSummary | null;
  decidedBy: AdminRef | null;
  paidBy: AdminRef | null;
};

/**
 * What the customer paid for the task, by flow (N-1). Amounts are completed
 * STK legs to Nitume except `merchantDirectAmount`, which the customer pays
 * the merchant's Till/Paybill directly (not refundable by Nitume, shown for
 * context).
 */
export interface PaidBreakdown {
  serviceAndRunnerFee: string;
  itemAmountToNitume: string;
  priceChangeDifferences: string;
  totalPaidToNitume: string;
  merchantDirectAmount: string;
}

/** Admin detail: list item + customer contact, paid breakdown, sibling reviews. */
export type AdminRefundDetail = AdminRefundItem & {
  customer: {
    userId: string;
    displayName: string | null;
    /** First name and last initial, e.g. "Amina W.", or null. */
    shortName: string | null;
    /** Login phone. */
    phone: string | null;
    /**
     * Where the manual M-Pesa refund goes: the default M-Pesa method's phone,
     * else the login phone (same rule as the STK payer phone).
     */
    mpesaPhone: string | null;
  } | null;
  paid: PaidBreakdown;
  /** Other refund reviews of the same task (e.g. cancellation + decreases). */
  otherReviews: Pick<RefundReview, 'id' | 'trigger' | 'status' | 'amountPaid' | 'refundAmount'>[];
  /** Payout corrections, oldest first (row 100); empty unless refunded. */
  corrections: RefundPayoutCorrectionView[];
  /**
   * Highest `newAmount` a correction or re-sent payout may carry (refunded
   * only, else null): the review's `amountPaid`, net of the committed
   * amounts of the task's other approved/refunded reviews, never below 0.
   */
  correctionCeiling: string | null;
};

interface StatusChanged {
  errandId: string;
  status: ErrandStatus;
  from?: ErrandStatus | null;
}

@Injectable()
export class RefundsService implements OnModuleInit {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectRepository(RefundReview)
    private readonly reviews: Repository<RefundReview>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentTransaction)
    private readonly transactions: Repository<PaymentTransaction>,
    private readonly errands: ErrandsService,
    private readonly events?: EventEmitter2,
    private readonly users?: UsersService,
    private readonly accounts?: CustomerAccountsService,
    private readonly customers?: CustomersService,
    @InjectRepository(RefundPayoutCorrection)
    private readonly corrections?: Repository<RefundPayoutCorrection>,
  ) {}

  /**
   * Tells listeners the review changed. `notifyCustomer: false` (payout
   * corrections and reversals, AQ-9 default) refreshes without a customer
   * notification.
   */
  private announce(
    row: Pick<RefundReview, 'errandId' | 'id' | 'status' | 'refundAmount'>,
    notifyCustomer = true,
  ): void {
    const events = this.events;
    if (!events) {
      return;
    }
    setImmediate(() =>
      events.emit('refund.updated', {
        errandId: row.errandId,
        refundId: row.id,
        status: row.status,
        refundAmount: row.refundAmount,
        notifyCustomer,
      }),
    );
  }

  /**
   * Every CANCELLED, EXPIRED or FAILED transition opens the refund review
   * (when the customer had paid) inside the same transaction, so the review
   * commits with the transition or not at all (rows 37, 102). A review, never
   * an automatic refund: an admin still decides the amount.
   */
  onModuleInit(): void {
    this.errands.onTerminated(async (manager, change) => {
      await this.openWithin(
        manager,
        change.errandId,
        triggerFor(change.from, change.guard, change.to),
      );
    });
  }

  /**
   * Backstop after commit. The review is already opened in the terminating
   * transaction; this only catches STK payments that completed while the
   * transition was in flight. Idempotent: one review per errand, and the
   * amount is refreshed only while the review is still pending.
   */
  @OnEvent('errand.status_changed', { async: true })
  async onStatusChanged(event: StatusChanged): Promise<void> {
    if (!REFUNDABLE_TERMINAL_STATUSES.includes(event.status)) {
      return;
    }
    try {
      await this.openIfPaid(event.errandId, triggerFor(event.from ?? null, undefined, event.status));
    } catch (err) {
      this.logger.error(
        `Could not refresh refund review for ${event.errandId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Opens (or refreshes the paid amount of) the refund review when the
   * errand is CANCELLED, EXPIRED or FAILED and the customer has completed
   * STK payments. Idempotent: one review per errand.
   */
  async openIfPaid(errandId: string, trigger: RefundTrigger): Promise<RefundReview | null> {
    const errand = await this.errands.getById(errandId);
    if (!REFUNDABLE_TERMINAL_STATUSES.includes(errand.status)) {
      return null;
    }
    return this.reviews.manager.transaction((manager) =>
      this.openWithin(manager, errandId, trigger),
    );
  }

  /**
   * Same as `openIfPaid` for a caller that already runs a transaction on a
   * CANCELLED, EXPIRED or FAILED errand. Upserts on the errand's one cancellation review (the
   * partial unique index on errandId where priceChangeRequestId is null), so
   * concurrent opens never create a second one and never abort the caller's
   * transaction.
   */
  async openWithin(
    manager: EntityManager,
    errandId: string,
    trigger: RefundTrigger,
  ): Promise<RefundReview | null> {
    const amountPaid = await this.amountPaid(errandId, manager);
    if (amountPaid <= 0) {
      return null;
    }
    await manager.query(
      `INSERT INTO "refund_reviews" ("errandId", "trigger", "amountPaid")
       VALUES ($1, $2, $3)
       ON CONFLICT ("errandId") WHERE "priceChangeRequestId" IS NULL DO UPDATE
         SET "amountPaid" = EXCLUDED."amountPaid", "updatedAt" = now()
         WHERE "refund_reviews"."status" = $4`,
      [errandId, trigger, amountPaid.toFixed(2), RefundStatus.PENDING_REVIEW],
    );
    return manager
      .getRepository(RefundReview)
      .findOne({ where: { errandId, priceChangeRequestId: IsNull() } });
  }

  /**
   * Opens the refund review of an approved price DECREASE on a paid task
   * (rows 48, 71): its own review, recorded independently of any other, for
   * the difference (`amountPaid` = the decrease, the refund ceiling). Runs
   * in the approval transaction; idempotent per price-change request.
   */
  async openForDecrease(
    manager: EntityManager,
    errandId: string,
    priceChangeRequestId: string,
    decrease: number,
  ): Promise<RefundReview | null> {
    if (decrease <= 0) {
      return null;
    }
    await manager.query(
      `INSERT INTO "refund_reviews" ("errandId", "priceChangeRequestId", "trigger", "amountPaid")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("priceChangeRequestId") WHERE "priceChangeRequestId" IS NOT NULL DO NOTHING`,
      [errandId, priceChangeRequestId, RefundTrigger.PRICE_CHANGE_DECREASE, decrease.toFixed(2)],
    );
    return manager.getRepository(RefundReview).findOne({ where: { priceChangeRequestId } });
  }

  /** The errand's cancellation review, if any (no access check). */
  cancellationReviewFor(errandId: string): Promise<RefundReview | null> {
    return this.reviews.findOne({ where: { errandId, priceChangeRequestId: IsNull() } });
  }

  async list(opts: {
    status?: RefundStatus;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AdminRefundItem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qb = this.reviews
      .createQueryBuilder('r')
      .orderBy('r."createdAt"', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit + 1);
    if (opts.status) {
      qb.andWhere(statusFilter(opts.status), { status: opts.status, ...STATUS_FILTER_PARAMS });
    }
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      qb.andWhere(
        '(r."createdAt" < :createdAt OR (r."createdAt" = :createdAt AND r.id < :id))',
        { createdAt: new Date(decoded[0]), id: decoded[1] },
      );
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.enrich(page),
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Number of refund reviews, optionally in one status (N-7, sidebar badge).
   * `approved` (Payout due) also counts refunded reviews whose payout was
   * reversed, as the list does (row 100).
   */
  async count(status?: RefundStatus): Promise<{ count: number }> {
    if (status !== RefundStatus.APPROVED) {
      return { count: await this.reviews.count({ where: status ? { status } : {} }) };
    }
    const qb = this.reviews
      .createQueryBuilder('r')
      .where(statusFilter(status), { status, ...STATUS_FILTER_PARAMS });
    return { count: await qb.getCount() };
  }

  /**
   * Admin detail (N-1, N-2): errand summary, admin names, the customer's
   * name and M-Pesa phone for the manual payout, what they paid by flow,
   * and the task's other refund reviews.
   */
  async detail(id: string): Promise<AdminRefundDetail> {
    const row = await this.get(id);
    const [item] = await this.enrich([row]);
    const [customer, paid, siblings] = await Promise.all([
      this.customerContact(item.errand ? row.errandId : null),
      this.paidBreakdown(row.errandId),
      this.reviews.find({ where: { errandId: row.errandId }, order: { createdAt: 'ASC' } }),
    ]);
    const corrections = await this.correctionsOf(siblings.map((r) => r.id));
    const own = corrections.get(row.id) ?? [];
    const names =
      this.users && own.length > 0
        ? await this.users.displayNames([...new Set(own.map((c) => c.createdByUserId))])
        : new Map<string, string>();
    return Object.assign(item, {
      customer,
      paid,
      corrections: own.map((c) => toCorrectionView(c, names)),
      correctionCeiling:
        row.status === RefundStatus.REFUNDED
          ? correctionCeilingOf(row, Number(paid.totalPaidToNitume), siblings, corrections)
          : null,
      otherReviews: siblings
        .filter((r) => r.id !== row.id)
        .map((r) => ({
          id: r.id,
          trigger: r.trigger,
          status: r.status,
          amountPaid: r.amountPaid,
          refundAmount: r.refundAmount,
        })),
    });
  }

  /** Adds errand summaries and admin display names (batched). */
  private async enrich(rows: RefundReview[]): Promise<AdminRefundItem[]> {
    const [errands, names, positions, corrections] = await Promise.all([
      this.errands.findByIds(rows.map((r) => r.errandId)),
      this.users
        ? this.users.displayNames(
            rows.flatMap((r) => [r.decidedByUserId, r.paidByUserId]).filter((v): v is string => !!v),
          )
        : Promise.resolve(new Map<string, string>()),
      this.positions(rows),
      this.correctionsOf(rows.map((r) => r.id)),
    ]);
    const byId = new Map(errands.map((e) => [e.id, e]));
    const ref = (userId: string | null): AdminRef | null =>
      userId ? { id: userId, displayName: names.get(userId) ?? null } : null;
    return rows.map((row) => {
      const e = byId.get(row.errandId);
      return Object.assign(row, positions.get(row.id), {
        effectivePayout: effectivePayoutOf(row, corrections.get(row.id)),
        errand: e
          ? {
              id: e.id,
              reference: e.reference,
              title: e.title,
              description: e.description,
              category: e.category,
              status: e.status,
            }
          : null,
        decidedBy: ref(row.decidedByUserId),
        paidBy: ref(row.paidByUserId),
      });
    });
  }

  private async customerContact(errandId: string | null): Promise<AdminRefundDetail['customer']> {
    if (!errandId || !this.customers || !this.users || !this.accounts) {
      return null;
    }
    const errand = await this.errands.getById(errandId);
    const [profile] = await this.customers.findByIds([errand.customerId]);
    if (!profile) {
      return null;
    }
    const [user, methods] = await Promise.all([
      this.users.findById(profile.userId),
      this.accounts.listPaymentMethods(profile.userId),
    ]);
    const mpesa = methods.find(
      (m) => m.type === PaymentMethodType.MPESA && m.isDefault && m.phoneNumber,
    );
    const displayName = user?.displayName ?? null;
    return {
      userId: profile.userId,
      displayName,
      shortName: shortNameOf(displayName),
      phone: user?.phone ?? null,
      mpesaPhone: mpesa?.phoneNumber ?? user?.phone ?? null,
    };
  }

  /** Completed STK amounts by flow, plus the merchant_direct amount (N-1). */
  async paidBreakdown(errandId: string): Promise<PaidBreakdown> {
    const raw = await this.transactions
      .createQueryBuilder('t')
      .innerJoin(Payment, 'p', 'p.id = t."paymentId"')
      .innerJoin(PaymentType, 'pt', 'pt.id = t."paymentTypeId"')
      .select(
        `COALESCE(SUM(CASE WHEN p."priceChangeRequestId" IS NULL AND pt.code IN (:...feeCodes) THEN t.amount ELSE 0 END), 0)`,
        'fees',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN p."priceChangeRequestId" IS NULL AND pt.code = :merchant THEN t.amount ELSE 0 END), 0)`,
        'item',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN p."priceChangeRequestId" IS NOT NULL THEN t.amount ELSE 0 END), 0)`,
        'differences',
      )
      .where('p."errandId" = :errandId', { errandId })
      .andWhere('t.status = :completed', { completed: PaymentTransactionStatus.COMPLETED })
      .setParameters({
        feeCodes: [PaymentTypeCode.SERVICE_FEE, PaymentTypeCode.RUNNER_FEE],
        merchant: PaymentTypeCode.MERCHANT_PAYMENT,
      })
      .getRawOne<{ fees: string; item: string; differences: string }>();
    const direct = await this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p."merchantAmount"), 0)', 'total')
      .where('p."errandId" = :errandId', { errandId })
      .andWhere('p."paymentFlow" = :flow', { flow: PaymentFlow.MERCHANT_DIRECT })
      .andWhere('p.status <> :failed', { failed: PaymentStatus.FAILED })
      .getRawOne<{ total: string }>();
    const fees = Number(raw?.fees ?? 0);
    const item = Number(raw?.item ?? 0);
    const differences = Number(raw?.differences ?? 0);
    return {
      serviceAndRunnerFee: fees.toFixed(2),
      itemAmountToNitume: item.toFixed(2),
      priceChangeDifferences: differences.toFixed(2),
      totalPaidToNitume: (fees + item + differences).toFixed(2),
      merchantDirectAmount: Number(direct?.total ?? 0).toFixed(2),
    };
  }

  async get(id: string): Promise<RefundReview> {
    const row = await this.reviews.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Refund review not found');
    }
    return row;
  }

  /**
   * Customer-readable refund status of an errand (row 55): the owner
   * customer (or an admin) sees status and amounts; 404 `refund_not_found`
   * when no refund review exists. Internal admin notes are not exposed.
   * With several reviews (row 71) this is the cancellation review when there
   * is one, else the newest; `forCustomerAll` lists them all.
   */
  async forCustomer(
    errandId: string,
    viewer: { userId: string; role: string },
  ): Promise<CustomerRefundView> {
    await this.errands.getById(errandId, viewer);
    const row =
      (await this.reviews.findOne({ where: { errandId, priceChangeRequestId: IsNull() } })) ??
      (await this.reviews.findOne({ where: { errandId }, order: { createdAt: 'DESC' } }));
    if (!row) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'refund_not_found', 'No refund for this task');
    }
    return this.customerViewOf(row);
  }

  /** Customer view of one review: position (row 87) and effective payout (row 100). */
  async customerViewOf(row: RefundReview): Promise<CustomerRefundView> {
    const [positions, corrections] = await Promise.all([
      this.positions([row]),
      this.correctionsOf([row.id]),
    ]);
    return toCustomerView(row, positions.get(row.id), corrections.get(row.id));
  }

  /** Every refund review of the errand, newest first (row 71); may be empty. */
  async forCustomerAll(
    errandId: string,
    viewer: { userId: string; role: string },
  ): Promise<{ items: CustomerRefundView[] }> {
    await this.errands.getById(errandId, viewer);
    const rows = await this.reviews.find({ where: { errandId }, order: { createdAt: 'DESC' } });
    const [positions, corrections] = await Promise.all([
      this.positions(rows),
      this.correctionsOf(rows.map((r) => r.id)),
    ]);
    return {
      items: rows.map((r) => toCustomerView(r, positions.get(r.id), corrections.get(r.id))),
    };
  }

  /**
   * Admin sets the refund amount: 0 (no refund) up to the review's ceiling,
   * i.e. its own amountPaid and never more than what is still refundable on
   * the task after other approved/refunded reviews (rows 81, 87). Every
   * review of the task is row-locked, so two decisions on one task
   * serialise and cumulative refunds cannot exceed the amount paid.
   */
  async decide(
    id: string,
    refundAmount: number,
    note: string | undefined,
    adminUserId: string,
  ): Promise<AdminRefundReview> {
    const target = await this.get(id);
    const { saved, position } = await this.reviews.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RefundReview);
      const siblings = await repo.find({
        where: { errandId: target.errandId },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const row = siblings.find((r) => r.id === id);
      if (!row) {
        throw new NotFoundException('Refund review not found');
      }
      if (row.status !== RefundStatus.PENDING_REVIEW) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'refund_already_decided',
          `Refund review is already ${row.status}`,
        );
      }
      const totalPaid = await this.amountPaid(row.errandId, manager);
      const committed = withCommitted(
        siblings,
        await this.correctionsOf(siblings.map((r) => r.id), manager),
      );
      const before = refundPositionOf(row, totalPaid, committed);
      if (refundAmount > Number(before.refundCeiling)) {
        // Spec N-9: one code, the effective ceiling in `amountPaid`.
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'refund_exceeds_amount_paid',
          `Refund cannot exceed KSh ${before.refundCeiling} (paid to Nitume minus refunds already approved on this task)`,
          {
            amountPaid: before.refundCeiling,
            refundCeiling: before.refundCeiling,
            reviewAmountPaid: row.amountPaid,
            totalPaidToNitume: before.totalPaidToNitume,
            alreadyRefunded: before.alreadyRefunded,
          },
        );
      }
      row.refundAmount = refundAmount.toFixed(2);
      row.status = refundAmount > 0 ? RefundStatus.APPROVED : RefundStatus.NO_REFUND;
      row.decisionNote = note?.trim() || null;
      row.decidedByUserId = adminUserId;
      row.decidedAt = new Date();
      const out = await repo.save(row);
      return { saved: out, position: refundPositionOf(out, totalPaid, committed) };
    });
    this.announce(saved);
    return Object.assign(saved, position, { effectivePayout: null });
  }

  /**
   * Admin records the manual M-Pesa payout of an approved refund. Once
   * `refunded`, the receipt is locked (409 `refund_payout_locked`, row 82).
   */
  async markPaid(
    id: string,
    payoutReference: string,
    adminUserId: string,
  ): Promise<AdminRefundReview> {
    const row = await this.get(id);
    // Row 82: the payout receipt is final once recorded. Changes go through
    // POST /refunds/:id/corrections as separate audit records (row 100).
    if (row.status === RefundStatus.REFUNDED) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'refund_payout_locked',
        'The payout receipt of a refunded review cannot be changed; record a correction instead',
        { payoutReference: row.payoutReference, paidAt: row.paidAt?.toISOString() ?? null },
      );
    }
    if (row.status !== RefundStatus.APPROVED) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'refund_not_approved',
        `Only approved refunds can be marked paid (status ${row.status})`,
      );
    }
    row.status = RefundStatus.REFUNDED;
    row.payoutReference = payoutReference;
    row.paidByUserId = adminUserId;
    row.paidAt = new Date();
    const saved = await this.reviews.save(row);
    this.announce(saved);
    const positions = await this.positions([saved]);
    return Object.assign(saved, positions.get(saved.id), {
      effectivePayout: effectivePayoutOf(saved),
    });
  }

  /**
   * Records a payout correction on a `refunded` review (row 100, spec
   * drawer-refund "Corrections"). Append-only; the review row is never
   * changed. The review row is locked, so records on one review serialise and
   * each snapshots the effective payout it replaces.
   * - `corrected` (payout sent): new receipt and/or amount, at least one
   *   different from the effective payout;
   * - `reversed` (payout sent): `newReference` = reversal M-Pesa code;
   * - `resent` (payout reversed): `newReference` and `newAmount` required.
   * `newAmount` must be <= `correctionCeiling` (AQ-10 default: refused).
   * Returns the updated admin detail.
   */
  async addCorrection(
    id: string,
    input: PayoutCorrectionInput,
    adminUserId: string,
  ): Promise<AdminRefundDetail> {
    const reason = input.reason.trim();
    if (reason.length < CORRECTION_REASON_MIN_LENGTH || reason.length > CORRECTION_REASON_MAX_LENGTH) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'correction_reason_invalid',
        `Say why you're making this change (${CORRECTION_REASON_MIN_LENGTH}-${CORRECTION_REASON_MAX_LENGTH} characters)`,
      );
    }
    const newReference = input.newReference?.trim().toUpperCase() || null;
    const newAmount = input.newAmount ?? null;
    const saved = await this.reviews.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RefundReview);
      const row = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) {
        throw new NotFoundException('Refund review not found');
      }
      if (row.status !== RefundStatus.REFUNDED) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'refund_not_refunded',
          `Corrections can only be added after a payout is recorded (status ${row.status})`,
          { status: row.status },
        );
      }
      const siblings = await repo.find({ where: { errandId: row.errandId } });
      const corrections = await this.correctionsOf(siblings.map((r) => r.id), manager);
      const prior = corrections.get(row.id) ?? [];
      const latestId = prior[prior.length - 1]?.id ?? null;
      if ((input.expectedLatestCorrectionId ?? null) !== latestId) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'payout_correction_conflict',
          'Another admin changed this payout. Check the latest before you save.',
          { latestCorrectionId: latestId },
        );
      }
      const current = effectivePayoutOf(row, prior)!;
      const allowed =
        input.kind === RefundPayoutCorrectionKind.RESENT
          ? current.state === 'reversed'
          : current.state === 'sent';
      if (!allowed) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'payout_correction_kind_invalid',
          `A ${input.kind} record is not allowed while the payout is ${current.state}`,
          { kind: input.kind, state: current.state },
        );
      }
      let reference = newReference;
      let amount = newAmount;
      if (input.kind === RefundPayoutCorrectionKind.CORRECTED) {
        // Only what actually changes is recorded.
        if (reference === (current.reference ?? '').toUpperCase()) {
          reference = null;
        }
        if (amount !== null && amount.toFixed(2) === current.amount) {
          amount = null;
        }
        if (reference === null && amount === null) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            'correction_no_change',
            'Nothing to correct: the receipt and amount match the record.',
          );
        }
      } else if (!reference) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_reference_required',
          'Enter the M-Pesa code',
        );
      }
      if (input.kind === RefundPayoutCorrectionKind.REVERSED && amount !== null) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_amount_not_allowed',
          'A reversal reverses the whole payout; send no amount (a partial reversal is a corrected record with the lower amount)',
        );
      } else if (input.kind === RefundPayoutCorrectionKind.RESENT && amount === null) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_amount_required',
          'Enter the amount sent',
        );
      }
      if (amount !== null) {
        const totalPaid = await this.amountPaid(row.errandId, manager);
        const ceiling = correctionCeilingOf(row, totalPaid, siblings, corrections);
        if (amount <= 0 || amount > Number(ceiling)) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            'refund_exceeds_amount_paid',
            `The amount can't be more than KSh ${ceiling} for this review`,
            { correctionCeiling: ceiling, amountPaid: ceiling },
          );
        }
      }
      if (reference && (await this.referenceUsed(manager, reference))) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'payout_reference_reused',
          'This M-Pesa code is already recorded on a payout.',
          { reference },
        );
      }
      const correctionRepo = manager.getRepository(RefundPayoutCorrection);
      await correctionRepo.save(
        correctionRepo.create({
          refundReviewId: row.id,
          kind: input.kind,
          previousReference: current.reference,
          previousAmount: current.amount,
          newReference: reference,
          newAmount: amount === null ? null : amount.toFixed(2),
          reason,
          createdByUserId: adminUserId,
        }),
      );
      return row;
    });
    const detail = await this.detail(id);
    const view = toCustomerView(detail, detail, detail.corrections);
    // AQ-9 default: only a re-sent payout notifies the customer.
    this.announce(
      { errandId: saved.errandId, id: saved.id, status: view.status, refundAmount: view.refundAmount },
      input.kind === RefundPayoutCorrectionKind.RESENT,
    );
    return detail;
  }

  /** True when the receipt is already on any refund payout or correction. */
  private async referenceUsed(manager: EntityManager, reference: string): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM "refund_reviews" WHERE UPPER("payoutReference") = $1
       UNION ALL
       SELECT 1 FROM "refund_payout_corrections" WHERE UPPER("newReference") = $1
       LIMIT 1`,
      [reference],
    );
    return rows.length > 0;
  }

  /** Corrections per review id, oldest first (batched). */
  private async correctionsOf(
    reviewIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, RefundPayoutCorrection[]>> {
    const out = new Map<string, RefundPayoutCorrection[]>();
    const repo = manager ? manager.getRepository(RefundPayoutCorrection) : this.corrections;
    if (!repo || reviewIds.length === 0) {
      return out;
    }
    const rows = await repo.find({
      where: { refundReviewId: In(reviewIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const c of rows) {
      out.set(c.refundReviewId, [...(out.get(c.refundReviewId) ?? []), c]);
    }
    return out;
  }

  /**
   * Cumulative position of each row (row 87), batched: one query for the
   * tasks' reviews and one for what was paid to Nitume per task.
   */
  private async positions(rows: RefundReview[]): Promise<Map<string, RefundPosition>> {
    const out = new Map<string, RefundPosition>();
    const errandIds = [...new Set(rows.map((r) => r.errandId))];
    if (errandIds.length === 0) {
      return out;
    }
    const [siblings, paid] = await Promise.all([
      this.reviews.find({ where: { errandId: In(errandIds) } }),
      this.paidByErrand(errandIds),
    ]);
    const committed = withCommitted(siblings, await this.correctionsOf(siblings.map((r) => r.id)));
    for (const row of rows) {
      const own = committed.filter((r) => r.errandId === row.errandId);
      const self = own.find((r) => r.id === row.id) ?? row;
      out.set(row.id, refundPositionOf(self, paid.get(row.errandId) ?? 0, own));
    }
    return out;
  }

  /** Completed STK amounts paid to Nitume, per errand. */
  private async paidByErrand(errandIds: string[]): Promise<Map<string, number>> {
    const raw = await this.transactions
      .createQueryBuilder('t')
      .innerJoin(Payment, 'p', 'p.id = t."paymentId"')
      .select('p."errandId"', 'errandId')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('p."errandId" IN (:...errandIds)', { errandIds })
      .andWhere('t.status = :completed', { completed: PaymentTransactionStatus.COMPLETED })
      .groupBy('p."errandId"')
      .getRawMany<{ errandId: string; total: string }>();
    return new Map(raw.map((r) => [r.errandId, Number(r.total)]));
  }

  /** Everything the customer paid through STK for this errand (completed legs). */
  private async amountPaid(errandId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(PaymentTransaction) : this.transactions;
    const raw = await repo
      .createQueryBuilder('t')
      .innerJoin(Payment, 'p', 'p.id = t."paymentId"')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('p."errandId" = :errandId', { errandId })
      .andWhere('t.status = :completed', { completed: PaymentTransactionStatus.COMPLETED })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }
}

/**
 * Customer view (rows 55, 69, 100): the effective payout only, mapped onto
 * the existing fields. Never corrections, reasons, receipts or admin ids.
 */
export const toCustomerView = (
  row: RefundReview,
  position: Pick<RefundPosition, 'remainingRefundable'> | undefined,
  corrections: CorrectionStep[] = [],
): CustomerRefundView => {
  const payout = effectivePayoutOf(row, corrections);
  const reversed = payout?.state === 'reversed';
  return {
    id: row.id,
    errandId: row.errandId,
    trigger: row.trigger,
    priceChangeRequestId: row.priceChangeRequestId ?? null,
    status: reversed ? RefundStatus.APPROVED : row.status,
    amountPaid: row.amountPaid,
    refundAmount: payout && !reversed ? payout.amount : row.refundAmount,
    remainingRefundable: position?.remainingRefundable ?? '0.00',
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    paidAt: payout && !reversed ? payout.at : reversed ? null : row.paidAt,
  };
};

/** Reviews with `refundAmount` replaced by what each commits to the cap (row 100). */
const withCommitted = <T extends RefundReview>(
  rows: T[],
  corrections: Map<string, CorrectionStep[]>,
): T[] =>
  rows.map((r) =>
    r.status === RefundStatus.REFUNDED
      ? Object.assign(Object.create(Object.getPrototypeOf(r) as object) as T, r, {
          refundAmount: committedAmountOf(r, corrections.get(r.id)),
        })
      : r,
  );

/** `correctionCeiling` of a refunded review (row 87 net of the other reviews, row 100). */
const correctionCeilingOf = (
  row: RefundReview,
  totalPaid: number,
  siblings: RefundReview[],
  corrections: Map<string, CorrectionStep[]>,
): string => {
  const others = withCommitted(
    siblings.filter((r) => r.id !== row.id),
    corrections,
  ).reduce(
    (sum, r) =>
      r.status === RefundStatus.APPROVED || r.status === RefundStatus.REFUNDED
        ? sum + Number(r.refundAmount ?? 0)
        : sum,
    0,
  );
  return Math.max(0, Math.min(Number(row.amountPaid), totalPaid - others)).toFixed(2);
};

const toCorrectionView = (
  c: RefundPayoutCorrection,
  names: Map<string, string>,
): RefundPayoutCorrectionView => ({
  id: c.id,
  kind: c.kind,
  previousReference: c.previousReference,
  previousAmount: c.previousAmount,
  newReference: c.newReference,
  newAmount: c.newAmount,
  reason: c.reason,
  createdByUserId: c.createdByUserId,
  createdBy: { id: c.createdByUserId, displayName: names.get(c.createdByUserId) ?? null },
  createdAt: c.createdAt,
});

/**
 * Status filter of the admin list/count. `approved` ("Payout due") also
 * matches refunded reviews whose latest correction is a reversal (row 100).
 */
const statusFilter = (status: RefundStatus): string =>
  status === RefundStatus.APPROVED
    ? `(r.status = :status OR (r.status = :refunded AND (
         SELECT c.kind FROM "refund_payout_corrections" c
         WHERE c."refundReviewId" = r.id
         ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1) = :reversed))`
    : 'r.status = :status';

const STATUS_FILTER_PARAMS = {
  refunded: RefundStatus.REFUNDED,
  reversed: RefundPayoutCorrectionKind.REVERSED,
};

/** "Amina Wanjiru" -> "Amina W."; one word stays as is; null without a name. */
export const shortNameOf = (displayName: string | null): string | null => {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

/**
 * Why the task's cancellation review opens. `to` is the terminal status
 * (CANCELLED by default): EXPIRED and FAILED have their own triggers (row 102).
 */
export const triggerFor = (
  from: ErrandStatus | null,
  guard?: TransitionGuard,
  to: ErrandStatus = ErrandStatus.CANCELLED,
): RefundTrigger => {
  if (to === ErrandStatus.EXPIRED) {
    return RefundTrigger.EXPIRED_AFTER_PAYMENT;
  }
  if (to === ErrandStatus.FAILED) {
    return RefundTrigger.FAILED_AFTER_PAYMENT;
  }
  if (guard === TransitionGuard.PRICE_CHANGE_REJECTION) {
    return RefundTrigger.PRICE_CHANGE_REJECTED;
  }
  switch (from) {
    case ErrandStatus.IN_PROGRESS:
      return RefundTrigger.PRICE_CHANGE_REJECTED;
    case ErrandStatus.DISPUTED:
      return RefundTrigger.DISPUTE_CUSTOMER_FAVOURABLE;
    default:
      return RefundTrigger.CANCELLED_AFTER_PAYMENT;
  }
};

const encodeCursor = (row: RefundReview): string =>
  Buffer.from(`${row.createdAt.toISOString()}::${row.id}`, 'utf-8').toString('base64');

const decodeCursor = (cursor: string | undefined): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
  return createdAt && id && !Number.isNaN(Date.parse(createdAt)) ? [createdAt, id] : null;
};
