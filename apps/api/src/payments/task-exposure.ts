import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ApiError } from '../common/api-error';
import { TaskExposureOverride, TaskExposureOverrideSource } from './task-exposure-override.entity';

/**
 * Owner answer row 136: a task's customer refunds and the runner's item
 * reimbursement must not each be capped independently. Rule used here:
 *
 *   committed customer refunds + committed runner item reimbursement
 *     <= total paid to Nitume for the task
 *
 * Refunds are attributed to the fees first, then to the item, so this is the
 * same as "refund attributable to the item + item reimbursement <= item
 * amount paid to Nitume" (the item reimbursement is separately capped at the
 * item amount). The total is used because the refund ceiling already uses it
 * (rows 81, 87). Committed refunds use effective payouts (row 100; a
 * reversed, not re-sent refund stays committed, row 111); committed
 * reimbursements are item lines that are payable or paid (on-hold claims are
 * not committed yet). Runner fees are not part of it: no runner fee is ever
 * paid on a CANCELLED or FAILED task (row 106), the only tasks where both a
 * refund and a reimbursement can exist.
 *
 * Every write that can commit money on either side takes the task-level
 * advisory lock first, so two decisions on one task serialise.
 */
export interface TaskExposure {
  totalPaidToNitume: string;
  committedRefunds: string;
  committedReimbursements: string;
  /** What can still be committed without an override. */
  remaining: string;
}

export const EXPOSURE_OVERRIDE_NOTE_MIN = 10;
export const EXPOSURE_OVERRIDE_NOTE_MAX = 500;

const money = (n: number): string => n.toFixed(2);

/** Takes the task's exposure lock until the transaction ends. */
export const lockTaskExposure = async (manager: EntityManager, errandId: string): Promise<void> => {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`task_exposure:${errandId}`]);
};

/** Item reimbursement committed to the runner (payable or paid lines), optionally excluding one line. */
export const committedReimbursements = async (
  manager: EntityManager,
  errandId: string,
  excludeLineId?: string,
): Promise<number> => {
  const rows: { total: string | null }[] = await manager.query(
    `SELECT COALESCE(SUM("amount"), 0) AS total FROM "runner_payout_lines"
      WHERE "errandId" = $1 AND kind = 'item_reimbursement' AND status IN ('payable', 'paid')
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [errandId, excludeLineId ?? null],
  );
  return Number(rows?.[0]?.total ?? 0);
};

/**
 * Item amount paid to Nitume for the task, gross: every completed
 * merchant-payment leg (original item amount and price-increase STKs),
 * before any refund.
 */
export const itemPaidGross = async (manager: EntityManager, errandId: string): Promise<number> => {
  const rows: { total: string | null }[] = await manager.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM "payment_transactions" t
       JOIN "payments" p ON p.id = t."paymentId"
       JOIN "payment_type" pt ON pt.id = t."paymentTypeId"
      WHERE p."errandId" = $1 AND t.status = 'completed' AND pt.code = 'merchant_payment'`,
    [errandId],
  );
  return Number(rows?.[0]?.total ?? 0);
};

export const exposureOf = (totalPaid: number, refunds: number, reimbursements: number): TaskExposure => ({
  totalPaidToNitume: money(totalPaid),
  committedRefunds: money(refunds),
  committedReimbursements: money(reimbursements),
  remaining: money(Math.max(0, totalPaid - refunds - reimbursements)),
});

/**
 * Refuses `amount` above the task's remaining exposure (409
 * `task_exposure_cap_exceeded`) unless an admin gives an override note
 * (10-500 characters, else 400 `exposure_override_note_invalid`); an
 * override is recorded append-only in the same transaction. Returns the
 * override row, or null when no override was needed.
 */
export const assertWithinExposure = async (
  manager: EntityManager,
  args: {
    errandId: string;
    amount: number;
    exposure: TaskExposure;
    overrideNote?: string | null;
    adminUserId: string;
    source: TaskExposureOverrideSource;
    refundReviewId?: string | null;
    runnerPayoutLineId?: string | null;
    /**
     * `task` (default): basis is the total paid to Nitume. `item`: basis is
     * the item amount paid to Nitume (gross), against price-decrease refunds
     * plus the runner's item reimbursement; the override row then stores the
     * item basis in `totalPaidToNitume` and the decrease refunds in
     * `committedRefunds`.
     */
    scope?: 'task' | 'item';
  },
): Promise<TaskExposureOverride | null> => {
  const remaining = Number(args.exposure.remaining);
  if (args.amount <= remaining) {
    return null;
  }
  const note = args.overrideNote?.trim() ?? '';
  if (!note) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      'task_exposure_cap_exceeded',
      args.scope === 'item'
        ? `Price-decrease refunds and the runner's item reimbursement can't go above the item amount paid, KSh ${args.exposure.totalPaidToNitume}; at most KSh ${args.exposure.remaining} more without an ops override`
        : `Refunds and the runner's item reimbursement on this task can't go above KSh ${args.exposure.totalPaidToNitume}; at most KSh ${args.exposure.remaining} more without an ops override`,
      { ...args.exposure, requested: money(args.amount), scope: args.scope ?? 'task' },
    );
  }
  if (note.length < EXPOSURE_OVERRIDE_NOTE_MIN || note.length > EXPOSURE_OVERRIDE_NOTE_MAX) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'exposure_override_note_invalid',
      `Explain the override (${EXPOSURE_OVERRIDE_NOTE_MIN}-${EXPOSURE_OVERRIDE_NOTE_MAX} characters)`,
      { minLength: EXPOSURE_OVERRIDE_NOTE_MIN, maxLength: EXPOSURE_OVERRIDE_NOTE_MAX },
    );
  }
  const repo = manager.getRepository(TaskExposureOverride);
  return repo.save(
    repo.create({
      errandId: args.errandId,
      source: args.source,
      refundReviewId: args.refundReviewId ?? null,
      runnerPayoutLineId: args.runnerPayoutLineId ?? null,
      amount: money(args.amount),
      normalCap: args.exposure.remaining,
      totalPaidToNitume: args.exposure.totalPaidToNitume,
      committedRefunds: args.exposure.committedRefunds,
      committedReimbursements: args.exposure.committedReimbursements,
      note,
      createdByUserId: args.adminUserId,
    }),
  );
};

/** Admin view of one override. */
export type TaskExposureOverrideView = Pick<
  TaskExposureOverride,
  | 'id'
  | 'source'
  | 'refundReviewId'
  | 'runnerPayoutLineId'
  | 'amount'
  | 'normalCap'
  | 'totalPaidToNitume'
  | 'committedRefunds'
  | 'committedReimbursements'
  | 'note'
  | 'createdByUserId'
  | 'createdAt'
>;

/** Overrides recorded on a task, oldest first. */
export const overridesFor = async (manager: EntityManager, errandId: string): Promise<TaskExposureOverrideView[]> =>
  manager.getRepository(TaskExposureOverride).find({ where: { errandId }, order: { createdAt: 'ASC' } });
