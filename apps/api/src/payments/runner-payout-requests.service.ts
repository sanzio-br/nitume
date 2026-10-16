import { HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
/** How long an Idempotency-Key on a payout request is remembered. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

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
  /** Rejection reason (shown to the runner); null otherwise. */
  decisionNote: string | null;
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
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: AdminRef | null;
  paidAt: Date | null;
  payoutReference: string | null;
  /** Lines paid on this request (empty until paid). */
  lineIds: string[];
  /** Rejection reason; null otherwise. */
  note: string | null;
}

export interface RunnerPayoutRequestSummary {
  /** Server-configured minimum (rows 117, 159; KES 500 by default). */
  minimumAmount: string;
  availableAmount: string;
  openRequest: Pick<RunnerPayoutRequestView, 'id' | 'requestedAmount' | 'status' | 'createdAt'> | null;
}

/**
 * Runner payout requests (owner answers rows 117, 118, 146, 153; RA-15,
 * N-17). A runner asks for a payout up to their available amount, above a
 * configurable minimum, one open request at a time; the destination is their
 * sign-in phone. Ops pay it by marking whole payable lines paid (the same
 * step as `mark-paid`, linking the lines to the request) or reject it with a
 * reason. No balance is stored: the ledger lines stay the only record of
 * what is owed. No payout time is promised anywhere (row 143).
 */
@Injectable()
export class RunnerPayoutRequestsService {
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
   * payout_request_open (`requestId`). With an `Idempotency-Key`, a replay
   * returns the request it created.
   */
  async create(runnerUserId: string, amount: number, idempotencyKey?: string): Promise<RunnerPayoutRequestView> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const key = idempotencyKey?.trim()
      ? `idem:runner-payout-request:${runner.id}:${idempotencyKey.trim().slice(0, 128)}`
      : null;
    if (key && this.redis) {
      const existing = await this.redis.get(key);
      if (existing) {
        const row = await this.requests.findOne({ where: { id: existing, runnerProfileId: runner.id } });
        if (row) {
          return toRunnerView(row);
        }
      }
    }
    const user = await this.users.findById(runnerUserId);
    if (!user?.phone) {
      throw new ApiError(HttpStatus.CONFLICT, 'payout_destination_missing', 'Your account has no sign-in phone to pay to');
    }
    const saved = await this.requests.manager.transaction(async (manager) => {
      await lockRunner(manager, runner.id);
      const repo = manager.getRepository(RunnerPayoutRequest);
      const open = await repo.findOne({ where: { runnerProfileId: runner.id, status: R.REQUESTED } });
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
      const available = await this.ledger.availableFor(runner.id, manager);
      if (amount > available) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'payout_exceeds_available',
          `You can request up to KSh ${money(available)}`,
          { availableAmount: money(available) },
        );
      }
      return repo.save(
        repo.create({
          runnerProfileId: runner.id,
          requestedAmount: money(amount),
          paidAmount: null,
          status: R.REQUESTED,
          destinationPhone: user.phone,
          payoutReference: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionNote: null,
          createdByUserId: runnerUserId,
        }),
      );
    });
    if (key && this.redis) {
      await this.redis.set(key, saved.id, IDEMPOTENCY_TTL_SECONDS);
    }
    return toRunnerView(saved);
  }

  /** GET /runners/me/payout-requests/summary. */
  async summaryFor(runnerUserId: string): Promise<RunnerPayoutRequestSummary> {
    const runner = await this.runners.profileByUserId(runnerUserId);
    const [open, available] = await Promise.all([
      this.requests.findOne({ where: { runnerProfileId: runner.id, status: R.REQUESTED } }),
      this.ledger.availableFor(runner.id),
    ]);
    return {
      minimumAmount: money(this.minimumAmount()),
      availableAmount: money(available),
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
      this.users.displayNames(rows.map((r) => r.decidedByUserId).filter((v): v is string => !!v)),
      this.requests.manager.getRepository(RunnerPayoutLine).find({
        where: { payoutRequestId: In(rows.map((r) => r.id)) },
        select: { id: true, payoutRequestId: true },
      }),
    ]);
    const phones = new Map<string, string | null>();
    const available = new Map<string, number>();
    for (const runnerId of runnerIds) {
      const profile = await this.runners.profileById(runnerId).catch(() => null);
      const user = profile ? await this.users.findById(profile.userId) : null;
      phones.set(runnerId, user?.phone ?? null);
      available.set(runnerId, await this.ledger.availableFor(runnerId));
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
