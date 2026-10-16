import { HttpStatus, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import { RedisService } from '../infra/redis/redis.service';
import { RunnersService } from '../runners/runners.service';
import { UsersService } from '../users/users.service';
import { normalizeReference } from './payout-references';
import { RunnerPayoutLine, RunnerPayoutLineStatus } from './runner-payout-line.entity';
import { RunnerPayoutRequest, RunnerPayoutRequestStatus } from './runner-payout-request.entity';
import { RunnerPayoutsService } from './runner-payouts.service';

const R = RunnerPayoutRequestStatus;
const money = (v: string | number | null | undefined): string => Number(v ?? 0).toFixed(2);

/** Row 159 (owner, 2026-10-16): smallest payout request, KES. */
export const DEFAULT_MIN_RUNNER_PAYOUT_REQUEST = 500;
export const REJECT_NOTE_MIN = 5;
export const REJECT_NOTE_MAX = 300;
/** Row 166: ops cancel reason length (10-500, proposed by the spec, pending the owner, AQ-14). */
export const CANCEL_REASON_MIN = 10;
export const CANCEL_REASON_MAX = 500;
/** How long an Idempotency-Key on a payout request is remembered. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
/** How long a reserved key waits for its first call to finish. */
export const IDEMPOTENCY_PENDING_TTL_SECONDS = 60;

/** Stored key value: `{ id, amount }` once created, `{ pending, amount }` while running; a bare id from round 8. */
const parseIdempotencyValue = (raw: string | null): { id: string | null; amount: string | null } | null => {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as { id?: string; amount?: string };
    return { id: value.id ?? null, amount: value.amount ?? null };
  } catch {
    return { id: raw, amount: null };
  }
};

/** A request as the runner sees it (v-payout, v-earnings, x-payout-history). */
export interface RunnerPayoutRequestView {
  id: string;
  requestedAmount: string;
  /** Null until paid; may be lower than `requestedAmount` (row 146). */
  paidAmount: string | null;
  status: RunnerPayoutRequestStatus;
  destinationPhone: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** When the request was paid; null otherwise. */
  paidAt: Date | null;
  /** M-Pesa receipt once paid. */
  reference: string | null;
  /** Rejection reason (shown to the runner); null otherwise (also when cancelled). */
  decisionNote: string | null;
  /** When ops cancelled the request (row 166); null otherwise. The ops reason is not shown. */
  cancelledAt: Date | null;
}

export interface AdminRef {
  id: string;
  displayName: string | null;
}

/** A request as ops see it (p-payout-requests, N-17). */
export interface AdminRunnerPayoutRequestView {
  id: string;
  runner: { id: string; shortName: string | null; displayName: string | null; phone: string | null } | null;
  requestedAmount: string;
  paidAmount: string | null;
  status: RunnerPayoutRequestStatus;
  destinationPhone: string;
  /** The runner's available amount now (may be below the request). */
  availableAmount: string;
  /** Payable lines now: what this request can be paid with (review minor 2). */
  requestableAmount: string;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: AdminRef | null;
  paidAt: Date | null;
  payoutReference: string | null;
  /** Lines paid on this request (empty until paid). */
  lineIds: string[];
  /** Rejection reason; null otherwise. */
  note: string | null;
  /** The runner who submitted (row 165; always the request's runner). */
  createdBy: AdminRef;
  /** Last change (row 165): creation, then the status transition. */
  updatedAt: Date;
  /** Row 166: set only on a cancelled request. */
  cancelledAt: Date | null;
  cancelledBy: AdminRef | null;
  cancellationReason: string | null;
}

export interface RunnerPayoutRequestSummary {
  /** Server-configured minimum (rows 117, 159; KES 500 by default). */
  minimumAmount: string;
  availableAmount: string;
  /**
   * Review minor 2: the most a request can ask for (payable lines). Below
   * `availableAmount` only while a reversed payout awaits its re-send.
   */
  requestableAmount: string;
  openRequest: Pick<RunnerPayoutRequestView, 'id' | 'requestedAmount' | 'status' | 'createdAt'> | null;
}

/**
 * Runner payout requests (owner answers rows 117, 118, 146, 153; RA-15,
 * N-17). A runner asks for a payout up to their available amount, above a
 * configurable minimum, one open request at a time; the destination is their
 * sign-in phone. Ops pay it by marking whole payable lines paid (the same
 * step as `mark-paid`, linking the lines to the request), reject it with a
 * reason shown to the runner, or cancel it with an ops reason (row 166). No balance is stored: the ledger lines stay the only record of
 * what is owed. No payout time is promised anywhere (row 143).
 */
@Injectable()
export class RunnerPayoutRequestsService {
  private readonly logger = new Logger(RunnerPayoutRequestsService.name);

  constructor(
    @InjectRepository(RunnerPayoutRequest)
    private readonly requests: Repository<RunnerPayoutRequest>,
    private readonly ledger: RunnerPayoutsService,
    private readonly runners: RunnersService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /** Row 159: KES 500 unless MIN_RUNNER_PAYOUT_REQUEST says otherwise. */
  minimumAmount(): number {
    const value = Number(this.config.get<number>('runnerPayouts.minimumRequestAmount', DEFAULT_MIN_RUNNER_PAYOUT_REQUEST));
    return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_MIN_RUNNER_PAYOUT_REQUEST;
  }

  // ---- runner ----------------------------------------------------------------

  /**
   * POST /runners/me/payout-requests. Errors: 400 payout_below_minimum
   * (`minimumAmount`), payout_exceeds_available (`availableAmount`); 409
   * payout_request_open (`requestId`).
   *
   * `Idempotency-Key` (review minor 1): the key is reserved atomically (SET
   * NX) before any work and bound to the amount. A replay with the same
   * amount returns the request it created; with another amount 409
   * idempotency_key_reused (`requestId` when known); while the first call is
   * still running 409 idempotency_in_progress (retry shortly). A refused
   * request releases the key. Redis failures never fail a committed
   * request: the one-open-request rule still prevents a duplicate.
   */
  async create(runnerUserId: string, amount: number, idempotencyKey?: string): Promise<RunnerPayoutRequestView> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const key = idempotencyKey?.trim()
      ? `idem:runner-payout-request:${runner.id}:${idempotencyKey.trim().slice(0, 128)}`
      : null;
    const requested = money(amount);
    let reserved = false;
    if (key && this.redis) {
      const replay = await this.reserveKey(key, runner.id, requested);
      if (replay) {
        return replay;
      }
      reserved = true;
    }
    let saved: RunnerPayoutRequest;
    try {
      saved = await this.createLocked(runner.id, runnerUserId, amount);
    } catch (err) {
      if (reserved && key) {
        await this.redis?.del(key).catch(() => undefined);
      }
      throw err;
    }
    if (reserved && key) {
      await this.redis
        ?.set(key, JSON.stringify({ id: saved.id, amount: requested }), IDEMPOTENCY_TTL_SECONDS)
        .catch((err: unknown) =>
          this.logger.error(
            `Payout request ${saved.id} committed but its idempotency key was not stored: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }
    return toRunnerView(saved);
  }

  /**
   * Reserves the idempotency key, or returns the request of an earlier call
   * with the same key and amount. Throws 409 on a different amount or a call
   * still in flight. Null = reserved, go ahead (also when Redis is down).
   */
  private async reserveKey(key: string, runnerProfileId: string, amount: string): Promise<RunnerPayoutRequestView | null> {
    try {
      if (await this.redis!.setIfAbsent(key, JSON.stringify({ pending: true, amount }), IDEMPOTENCY_PENDING_TTL_SECONDS)) {
        return null;
      }
      const raw = await this.redis!.get(key);
      const stored = parseIdempotencyValue(raw);
      if (!stored) {
        return null; // Expired between the two calls: proceed (the open-request rule guards).
      }
      if (stored.amount !== null && stored.amount !== amount) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'idempotency_key_reused',
          'This Idempotency-Key was used for a different amount',
          stored.id ? { requestId: stored.id } : {},
        );
      }
      if (!stored.id) {
        throw new ApiError(HttpStatus.CONFLICT, 'idempotency_in_progress', 'This request is still being processed. Try again shortly.');
      }
      const row = await this.requests.findOne({ where: { id: stored.id, runnerProfileId } });
      return row ? toRunnerView(row) : null;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      this.logger.warn(`Idempotency store unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async createLocked(runnerProfileId: string, runnerUserId: string, amount: number): Promise<RunnerPayoutRequest> {
    const user = await this.users.findById(runnerUserId);
    if (!user?.phone) {
      throw new ApiError(HttpStatus.CONFLICT, 'payout_destination_missing', 'Your account has no sign-in phone to pay to');
    }
    return this.requests.manager.transaction(async (manager) => {
      await lockRunner(manager, runnerProfileId);
      const repo = manager.getRepository(RunnerPayoutRequest);
      const open = await repo.findOne({ where: { runnerProfileId, status: R.REQUESTED } });
      if (open) {
        throw new ApiError(HttpStatus.CONFLICT, 'payout_request_open', 'You already have a payout request open', {
          requestId: open.id,
        });
      }
      const minimum = this.minimumAmount();
      if (amount < minimum) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'payout_below_minimum', `The minimum payout is KSh ${money(minimum)}`, {
          minimumAmount: money(minimum),
        });
      }
      // Review minor 2: capped by the payable lines a request can be paid
      // with, not by reversed payouts awaiting a re-send.
      const [available, requestable] = await Promise.all([
        this.ledger.availableFor(runnerProfileId, manager),
        this.ledger.requestableFor(runnerProfileId, manager),
      ]);
      if (amount > requestable) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_exceeds_available',
          `You can request up to KSh ${money(requestable)}`,
          { availableAmount: money(available), requestableAmount: money(requestable) },
        );
      }
      return repo.save(
        repo.create({
          runnerProfileId,
          requestedAmount: money(amount),
          paidAmount: null,
          status: R.REQUESTED,
          destinationPhone: user.phone,
          payoutReference: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionNote: null,
          cancelledByUserId: null,
          cancelledAt: null,
          cancellationReason: null,
          // Row 165: always the authenticated runner (from the JWT), never the body.
          createdByUserId: runnerUserId,
        }),
      );
    });
  }

  /** GET /runners/me/payout-requests/summary. */
  async summaryFor(runnerUserId: string): Promise<RunnerPayoutRequestSummary> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const [open, available, requestable] = await Promise.all([
      this.requests.findOne({ where: { runnerProfileId: runner.id, status: R.REQUESTED } }),
      this.ledger.availableFor(runner.id),
      this.ledger.requestableFor(runner.id),
    ]);
    return {
      minimumAmount: money(this.minimumAmount()),
      availableAmount: money(available),
      requestableAmount: money(requestable),
      openRequest: open
        ? { id: open.id, requestedAmount: money(open.requestedAmount), status: open.status, createdAt: open.createdAt }
        : null,
    };
  }

  /** GET /runners/me/payout-requests: newest first, cursor pagination. */
  async listMine(
    runnerUserId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: RunnerPayoutRequestView[]; nextCursor: string | null }> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const page = await this.page({ runnerProfileId: runner.id, cursor: opts.cursor, limit: opts.limit });
    return { items: page.rows.map(toRunnerView), nextCursor: page.nextCursor };
  }

  // ---- admin -----------------------------------------------------------------

  async list(opts: {
    status?: RunnerPayoutRequestStatus;
    runnerProfileId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AdminRunnerPayoutRequestView[]; nextCursor: string | null }> {
    const page = await this.page(opts);
    return { items: await this.enrich(page.rows), nextCursor: page.nextCursor };
  }

  async count(status?: RunnerPayoutRequestStatus): Promise<{ count: number }> {
    return { count: await this.requests.count({ where: status ? { status } : {} }) };
  }

  async detail(id: string): Promise<AdminRunnerPayoutRequestView> {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Payout request not found');
    }
    const [view] = await this.enrich([row]);
    return view;
  }

  /**
   * POST /runner-payout-requests/:id/pay: records the manual M-Pesa payout of
   * whole payable lines of the request's runner (same checks as mark-paid),
   * links them to the request and closes it `paid` with `paidAmount` = their
   * total (at most the request; row 146). Errors: 409
   * payout_request_not_open; 400 payout_exceeds_request (`requestedAmount`,
   * `selectedAmount`), payout_request_runner_mismatch; mark-paid errors.
   */
  async pay(
    id: string,
    lineIds: string[],
    payoutReference: string,
    adminUserId: string,
  ): Promise<AdminRunnerPayoutRequestView> {
    const ids = [...new Set(lineIds)].sort();
    await this.requests.manager.transaction(async (manager) => {
      const request = await this.lockOpen(manager, id);
      const lines = await manager.getRepository(RunnerPayoutLine).find({ where: { id: In(ids) } });
      if (lines.some((l) => l.runnerProfileId !== request.runnerProfileId)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_request_runner_mismatch',
          "Only the requesting runner's lines can be paid on this request",
        );
      }
      // Stored payable lines carry their approved amount (mark-paid refuses anything else).
      const selected = lines
        .filter((l) => l.status === RunnerPayoutLineStatus.PAYABLE)
        .reduce((t, l) => t + Number(l.amount ?? 0), 0);
      if (Math.round(selected * 100) > Math.round(Number(request.requestedAmount) * 100)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_exceeds_request',
          `Select lines totalling at most KSh ${money(request.requestedAmount)}`,
          { requestedAmount: money(request.requestedAmount), selectedAmount: money(selected) },
        );
      }
      const paid = await this.ledger.markPaidIn(manager, ids, payoutReference, adminUserId, request.id);
      const total = paid.reduce((t, l) => t + Number(l.amount ?? 0), 0);
      await manager.getRepository(RunnerPayoutRequest).update(request.id, {
        status: R.PAID,
        paidAmount: money(total),
        payoutReference: normalizeReference(payoutReference),
        decidedByUserId: adminUserId,
        decidedAt: new Date(),
      });
    });
    return this.detail(id);
  }

  /** POST /runner-payout-requests/:id/reject `{ note }` (5-300, shown to the runner). */
  async reject(id: string, noteInput: string, adminUserId: string): Promise<AdminRunnerPayoutRequestView> {
    const note = noteInput?.trim() ?? '';
    if (note.length < REJECT_NOTE_MIN || note.length > REJECT_NOTE_MAX) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'decision_note_required', 'Say why the request is not approved', {
        minLength: REJECT_NOTE_MIN,
        maxLength: REJECT_NOTE_MAX,
      });
    }
    await this.requests.manager.transaction(async (manager) => {
      const request = await this.lockOpen(manager, id);
      await manager.getRepository(RunnerPayoutRequest).update(request.id, {
        status: R.REJECTED,
        decisionNote: note,
        decidedByUserId: adminUserId,
        decidedAt: new Date(),
      });
    });
    return this.detail(id);
  }

  /**
   * POST /runner-payout-requests/:id/cancel `{ reason }` (row 166): ops only,
   * an open (`requested`) request only, mandatory reason (10-500, AQ-14). Final: no reopening; `requestedAmount` unchanged. No lines
   * are linked to an open request, so the runner's available amount is
   * unchanged and a new request can be made at once. Errors: 409
   * payout_request_not_open (`status`); 400 cancellation_reason_invalid
   * (`minLength`, `maxLength`).
   */
  async cancel(id: string, reasonInput: string, adminUserId: string): Promise<AdminRunnerPayoutRequestView> {
    const reason = reasonInput?.trim() ?? '';
    if (reason.length < CANCEL_REASON_MIN || reason.length > CANCEL_REASON_MAX) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'cancellation_reason_invalid', 'Say why the request is cancelled', {
        minLength: CANCEL_REASON_MIN,
        maxLength: CANCEL_REASON_MAX,
      });
    }
    await this.requests.manager.transaction(async (manager) => {
      const request = await this.lockOpen(manager, id);
      await manager.getRepository(RunnerPayoutRequest).update(request.id, {
        status: R.CANCELLED,
        cancellationReason: reason,
        cancelledByUserId: adminUserId,
        cancelledAt: new Date(),
      });
    });
    return this.detail(id);
  }

  // ---- internals ---------------------------------------------------------------

  private async lockOpen(manager: EntityManager, id: string): Promise<RunnerPayoutRequest> {
    const request = await manager
      .getRepository(RunnerPayoutRequest)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!request) {
      throw new NotFoundException('Payout request not found');
    }
    if (request.status !== R.REQUESTED) {
      throw new ApiError(HttpStatus.CONFLICT, 'payout_request_not_open', `This request is already ${request.status}`, {
        status: request.status,
      });
    }
    return request;
  }

  private async page(opts: {
    status?: RunnerPayoutRequestStatus;
    runnerProfileId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ rows: RunnerPayoutRequest[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qb = this.requests
      .createQueryBuilder('r')
      .orderBy('r."createdAt"', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit + 1);
    if (opts.status) {
      qb.andWhere('r.status = :status', { status: opts.status });
    }
    if (opts.runnerProfileId) {
      qb.andWhere('r."runnerProfileId" = :runnerProfileId', { runnerProfileId: opts.runnerProfileId });
    }
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      qb.andWhere('(r."createdAt" < :createdAt OR (r."createdAt" = :createdAt AND r.id < :id))', {
        createdAt: new Date(decoded[0]),
        id: decoded[1],
      });
    }
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${last.createdAt.toISOString()}::${last.id}`, 'utf-8').toString('base64')
          : null,
    };
  }

  private async enrich(rows: RunnerPayoutRequest[]): Promise<AdminRunnerPayoutRequestView[]> {
    if (rows.length === 0) {
      return [];
    }
    const runnerIds = [...new Set(rows.map((r) => r.runnerProfileId))];
    const [summaries, names, lines] = await Promise.all([
      this.runners.publicSummaries(runnerIds),
      this.users.displayNames(
        rows.flatMap((r) => [r.decidedByUserId, r.cancelledByUserId, r.createdByUserId]).filter((v): v is string => !!v),
      ),
      this.requests.manager.getRepository(RunnerPayoutLine).find({
        where: { payoutRequestId: In(rows.map((r) => r.id)) },
        select: { id: true, payoutRequestId: true },
      }),
    ]);
    const phones = new Map<string, string | null>();
    const available = new Map<string, number>();
    const requestable = new Map<string, number>();
    for (const runnerId of runnerIds) {
      const profile = await this.runners.profileById(runnerId).catch(() => null);
      const user = profile ? await this.users.findById(profile.userId) : null;
      phones.set(runnerId, user?.phone ?? null);
      available.set(runnerId, await this.ledger.availableFor(runnerId));
      requestable.set(runnerId, await this.ledger.requestableFor(runnerId));
    }
    return rows.map((r) => {
      const runner = summaries.get(r.runnerProfileId);
      return {
        id: r.id,
        runner: runner
          ? {
              id: runner.id,
              shortName: runner.shortName,
              displayName: runner.displayName,
              phone: phones.get(r.runnerProfileId) ?? null,
            }
          : null,
        requestedAmount: money(r.requestedAmount),
        paidAmount: r.paidAmount === null ? null : money(r.paidAmount),
        status: r.status,
        destinationPhone: r.destinationPhone,
        availableAmount: money(available.get(r.runnerProfileId)),
        requestableAmount: money(requestable.get(r.runnerProfileId)),
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        decidedBy: r.decidedByUserId ? { id: r.decidedByUserId, displayName: names.get(r.decidedByUserId) ?? null } : null,
        paidAt: r.status === R.PAID ? r.decidedAt : null,
        payoutReference: r.payoutReference,
        lineIds: lines
          .filter((l) => l.payoutRequestId === r.id)
          .map((l) => l.id)
          .sort(),
        note: r.status === R.REJECTED ? r.decisionNote : null,
        createdBy: { id: r.createdByUserId, displayName: names.get(r.createdByUserId) ?? null },
        updatedAt: r.updatedAt,
        cancelledAt: r.status === R.CANCELLED ? r.cancelledAt : null,
        cancelledBy:
          r.status === R.CANCELLED && r.cancelledByUserId
            ? { id: r.cancelledByUserId, displayName: names.get(r.cancelledByUserId) ?? null }
            : null,
        cancellationReason: r.status === R.CANCELLED ? r.cancellationReason : null,
      };
    });
  }
}

const toRunnerView = (r: RunnerPayoutRequest): RunnerPayoutRequestView => ({
  id: r.id,
  requestedAmount: money(r.requestedAmount),
  paidAmount: r.paidAmount === null ? null : money(r.paidAmount),
  status: r.status,
  destinationPhone: r.destinationPhone,
  createdAt: r.createdAt,
  decidedAt: r.decidedAt,
  paidAt: r.status === R.PAID ? r.decidedAt : null,
  reference: r.payoutReference,
  decisionNote: r.status === R.REJECTED ? r.decisionNote : null,
  cancelledAt: r.status === R.CANCELLED ? r.cancelledAt : null,
});

const lockRunner = (manager: EntityManager, runnerProfileId: string): Promise<unknown> =>
  manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`payout_request:${runnerProfileId}`]);

const decodeCursor = (cursor: string | undefined): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
  return createdAt && id && !Number.isNaN(Date.parse(createdAt)) ? [createdAt, id] : null;
};
