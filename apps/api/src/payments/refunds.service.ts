import { HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import { ErrandStatus, PaymentTransactionStatus } from '../common/enums';
import { TransitionGuard } from '../errands/errand-state-machine';
import { ErrandsService } from '../errands/errands.service';
import { PaymentTransaction } from './payment-transaction.entity';
import { Payment } from './payment.entity';
import { RefundReview, RefundStatus, RefundTrigger } from './refund-review.entity';

/** What the customer sees of a refund review (no admin notes or user ids). */
export interface CustomerRefundView {
  id: string;
  errandId: string;
  /** pending_review | approved | no_refund | refunded */
  status: RefundStatus;
  /** Everything the customer paid by STK for the task. */
  amountPaid: string;
  /** Null until an admin decides. */
  refundAmount: string | null;
  /** M-Pesa receipt of the manual payout, once refunded. */
  payoutReference: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  paidAt: Date | null;
}

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
  ) {}

  /**
   * Every CANCELLED transition opens the refund review (when the customer
   * had paid) inside the same transaction, so the review commits with the
   * cancellation or not at all.
   */
  onModuleInit(): void {
    this.errands.onCancelled(async (manager, change) => {
      await this.openWithin(manager, change.errandId, triggerFor(change.from, change.guard));
    });
  }

  /**
   * Backstop after commit. The review is already opened in the cancelling
   * transaction; this only catches STK payments that completed while the
   * cancellation was in flight. Idempotent: one review per errand, and the
   * amount is refreshed only while the review is still pending.
   */
  @OnEvent('errand.status_changed', { async: true })
  async onStatusChanged(event: StatusChanged): Promise<void> {
    if (event.status !== ErrandStatus.CANCELLED) {
      return;
    }
    try {
      await this.openIfPaid(event.errandId, triggerFor(event.from ?? null));
    } catch (err) {
      this.logger.error(
        `Could not refresh refund review for ${event.errandId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Opens (or refreshes the paid amount of) the refund review when the
   * errand is CANCELLED and the customer has completed STK payments.
   * Idempotent: one review per errand.
   */
  async openIfPaid(errandId: string, trigger: RefundTrigger): Promise<RefundReview | null> {
    const errand = await this.errands.getById(errandId);
    if (errand.status !== ErrandStatus.CANCELLED) {
      return null;
    }
    return this.reviews.manager.transaction((manager) =>
      this.openWithin(manager, errandId, trigger),
    );
  }

  /**
   * Same as `openIfPaid` for a caller that already runs a transaction on a
   * CANCELLED errand. Upserts on the unique errandId, so concurrent opens
   * never create a second review and never abort the caller's transaction.
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
       ON CONFLICT ("errandId") DO UPDATE
         SET "amountPaid" = EXCLUDED."amountPaid", "updatedAt" = now()
         WHERE "refund_reviews"."status" = $4`,
      [errandId, trigger, amountPaid.toFixed(2), RefundStatus.PENDING_REVIEW],
    );
    return manager.getRepository(RefundReview).findOne({ where: { errandId } });
  }

  async list(opts: {
    status?: RefundStatus;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: RefundReview[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qb = this.reviews
      .createQueryBuilder('r')
      .orderBy('r."createdAt"', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit + 1);
    if (opts.status) {
      qb.andWhere('r.status = :status', { status: opts.status });
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
      items: page,
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
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
   */
  async forCustomer(
    errandId: string,
    viewer: { userId: string; role: string },
  ): Promise<CustomerRefundView> {
    await this.errands.getById(errandId, viewer);
    const row = await this.reviews.findOne({ where: { errandId } });
    if (!row) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'refund_not_found', 'No refund for this task');
    }
    return {
      id: row.id,
      errandId: row.errandId,
      status: row.status,
      amountPaid: row.amountPaid,
      refundAmount: row.refundAmount,
      payoutReference: row.payoutReference,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      paidAt: row.paidAt,
    };
  }

  /** Admin sets the refund amount: 0 (no refund) up to the full amount paid. */
  async decide(
    id: string,
    refundAmount: number,
    note: string | undefined,
    adminUserId: string,
  ): Promise<RefundReview> {
    const row = await this.get(id);
    if (row.status !== RefundStatus.PENDING_REVIEW) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'refund_already_decided',
        `Refund review is already ${row.status}`,
      );
    }
    const paid = Number(row.amountPaid);
    if (refundAmount > paid) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'refund_exceeds_amount_paid',
        `Refund cannot exceed the amount paid (KES ${row.amountPaid})`,
        { amountPaid: row.amountPaid },
      );
    }
    row.refundAmount = refundAmount.toFixed(2);
    row.status = refundAmount > 0 ? RefundStatus.APPROVED : RefundStatus.NO_REFUND;
    row.decisionNote = note?.trim() || null;
    row.decidedByUserId = adminUserId;
    row.decidedAt = new Date();
    return this.reviews.save(row);
  }

  /** Admin records the manual M-Pesa payout of an approved refund. */
  async markPaid(id: string, payoutReference: string, adminUserId: string): Promise<RefundReview> {
    const row = await this.get(id);
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
    return this.reviews.save(row);
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

export const triggerFor = (
  from: ErrandStatus | null,
  guard?: TransitionGuard,
): RefundTrigger => {
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
