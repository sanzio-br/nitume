import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandStatus, StatusHistoryActor, UserRole } from '../common/enums';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { TransitionGuard } from './errand-state-machine';
import { DEADLINE_EXPIRY_NOTE, ErrandsService } from './errands.service';

const ADMIN = { type: StatusHistoryActor.ADMIN, id: 'admin-1' };
const REASON = '  No runner works this area on Sundays.  ';

const build = (status: ErrandStatus, assignments: Partial<ErrandAssignment>[] = [], opts: { eligible?: number | null } = {}) => {
  const errand = { id: 'e-1', reference: 'NT-1', customerId: 'c-1', status, deadlineAt: null } as Errand;
  const rows = assignments.map((a, i) => ({
    id: `a-${i + 1}`,
    errandId: 'e-1',
    runnerProfileId: `rp-${i + 1}`,
    createdAt: new Date(i),
    ...a,
  })) as ErrandAssignment[];
  const history: Partial<ErrandStatusHistory>[] = [];
  const assignmentRepo = {
    find: vi.fn(() => Promise.resolve([...rows].reverse())),
    update: vi.fn((where: { errandId?: string; status?: AssignmentStatus }, patch: object) => {
      for (const r of rows.filter((x) => !where.status || x.status === where.status)) {
        Object.assign(r, patch);
      }
      return Promise.resolve();
    }),
  };
  const repos = new Map<unknown, unknown>([
    [Errand, { findOne: vi.fn(() => Promise.resolve(errand)), save: vi.fn((e: Errand) => Promise.resolve(e)) }],
    [ErrandAssignment, assignmentRepo],
    [
      ErrandStatusHistory,
      {
        create: vi.fn((r: object) => r),
        save: vi.fn((r: Partial<ErrandStatusHistory>) => {
          history.push(r);
          return Promise.resolve(r);
        }),
      },
    ],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const emit = vi.fn();
  const service = new ErrandsService(
    { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
    { findOne: vi.fn(() => Promise.resolve(errand)) } as never,
    {} as never,
    {} as never,
    {} as never,
    assignmentRepo as never,
    {} as never,
    {} as never,
    { emit } as never,
    {} as never,
    {} as never,
  );
  const counter = vi.fn(() => Promise.resolve(opts.eligible ?? 0));
  if (opts.eligible !== null) {
    service.onEligibleRemaining(counter);
  }
  return { service, errand, rows, history, counter, emit };
};

const refusal = async (p: Promise<unknown>) => {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return (err as ApiError).getResponse() as Record<string, unknown>;
};

describe('ErrandsService.expireNoRunner (rows 187, 202, 203, 208)', () => {
  it('expires a RUNNER_ASSIGNED task with no open offer and no eligible online runner; admin actor, trimmed reason as the note', async () => {
    const { service, errand, history, counter } = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    const out = await service.adminExpire('e-1', REASON, ADMIN);
    expect(errand.status).toBe(ErrandStatus.EXPIRED);
    expect(out.history).toMatchObject({
      fromStatus: ErrandStatus.RUNNER_ASSIGNED,
      toStatus: ErrandStatus.EXPIRED,
      actorType: StatusHistoryActor.ADMIN,
      actorId: 'admin-1',
      note: 'No runner works this area on Sundays.',
    });
    expect(history).toHaveLength(1);
    expect(counter).toHaveBeenCalledWith(expect.anything(), 'e-1');
  });

  it.each([
    ['missing', undefined],
    ['blank', '          '],
    ['under 10 after trimming', '   too short  '],
    ['over 500', 'x'.repeat(501)],
  ])('refuses a %s reason (400 expiry_reason_invalid) before touching the task', async (_label, reason) => {
    const { service, errand } = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    const body = await refusal(service.adminExpire('e-1', reason, ADMIN));
    expect(body).toMatchObject({ statusCode: 400, code: 'expiry_reason_invalid', minLength: 10, maxLength: 500 });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
  });

  it('accepts exactly 10 and exactly 500 characters', async () => {
    const ten = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    await ten.service.adminExpire('e-1', '0123456789', ADMIN);
    expect(ten.errand.status).toBe(ErrandStatus.EXPIRED);
    const max = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.EXPIRED }]);
    await max.service.adminExpire('e-1', 'y'.repeat(500), ADMIN);
    expect(max.errand.status).toBe(ErrandStatus.EXPIRED);
  });

  it('refuses other statuses (not_expirable), and a task no longer in the status the client named', async () => {
    for (const status of [ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.EXPIRED, ErrandStatus.ACCEPTED]) {
      const { service, errand } = build(status);
      const body = await refusal(service.adminExpire('e-1', REASON, ADMIN));
      expect(body).toMatchObject({ statusCode: 409, code: 'expiry_not_allowed', reason: 'not_expirable', status });
      expect(errand.status).toBe(status);
    }
    const moved = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    expect(await refusal(moved.service.adminExpire('e-1', REASON, ADMIN, ErrandStatus.PAYMENT_CONFIRMED))).toMatchObject({
      reason: 'not_payment_confirmed',
      status: ErrandStatus.RUNNER_ASSIGNED,
    });
    expect(moved.errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    const paid = build(ErrandStatus.PAYMENT_CONFIRMED);
    paid.errand.deadlineAt = new Date(Date.now() - 1_000);
    expect(await refusal(paid.service.adminExpire('e-1', REASON, ADMIN, ErrandStatus.RUNNER_ASSIGNED))).toMatchObject({
      reason: 'not_runner_assigned',
      status: ErrandStatus.PAYMENT_CONFIRMED,
    });
  });

  it('refuses after the deadline: the sweep expires it (deadline_passed)', async () => {
    const { service, errand } = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    expect(await refusal(service.adminExpire('e-1', REASON, ADMIN))).toMatchObject({ reason: 'deadline_passed' });
  });

  it('refuses while an offer is open (open_offer); an offer past its own deadline counts as ended', async () => {
    const open = build(ErrandStatus.RUNNER_ASSIGNED, [
      { status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() + 60_000) },
    ]);
    expect(await refusal(open.service.adminExpire('e-1', REASON, ADMIN))).toMatchObject({ reason: 'open_offer' });

    const lapsed = build(ErrandStatus.RUNNER_ASSIGNED, [
      { status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() - 1_000) },
    ]);
    await lapsed.service.adminExpire('e-1', REASON, ADMIN);
    expect(lapsed.errand.status).toBe(ErrandStatus.EXPIRED);
    // Closed with the task (reviewer B1, row 183).
    expect(lapsed.rows[0].status).toBe(AssignmentStatus.EXPIRED);
  });

  it('refuses while eligible online runners remain (eligible_runners_remain, eligibleRemaining)', async () => {
    const { service, errand } = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }], { eligible: 2 });
    expect(await refusal(service.adminExpire('e-1', REASON, ADMIN))).toMatchObject({
      reason: 'eligible_runners_remain',
      eligibleRemaining: 2,
    });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
  });

  it('refuses when no pool counter is registered (fails closed)', async () => {
    const { service } = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }], { eligible: null });
    expect(await refusal(service.adminExpire('e-1', REASON, ADMIN))).toMatchObject({ reason: 'eligible_runners_remain' });
  });

  it('PATCH /status cannot do it for an admin (409 transition_requires_admin_expiry); the system sweep still can', async () => {
    const admin = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    const body = await refusal(admin.service.transition('e-1', ErrandStatus.EXPIRED, ADMIN, 'note'));
    expect(body).toMatchObject({ statusCode: 409, code: 'transition_requires_admin_expiry' });
    expect(admin.errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);

    const system = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    await system.service.transition('e-1', ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM }, DEADLINE_EXPIRY_NOTE);
    expect(system.errand.status).toBe(ErrandStatus.EXPIRED);
  });
});

describe('ErrandsService.adminExpire from PAYMENT_CONFIRMED (rows 201, 225, 226)', () => {
  it('expires a paid task never offered once its deadline passed; admin actor, trimmed reason', async () => {
    const { service, errand, history, counter } = build(ErrandStatus.PAYMENT_CONFIRMED);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    const out = await service.adminExpire('e-1', REASON, ADMIN, ErrandStatus.PAYMENT_CONFIRMED);
    expect(errand.status).toBe(ErrandStatus.EXPIRED);
    expect(out.history).toMatchObject({
      fromStatus: ErrandStatus.PAYMENT_CONFIRMED,
      toStatus: ErrandStatus.EXPIRED,
      actorType: StatusHistoryActor.ADMIN,
      actorId: 'admin-1',
      note: 'No runner works this area on Sundays.',
    });
    expect(history).toHaveLength(1);
    // No pool rule for a task never offered.
    expect(counter).not.toHaveBeenCalled();
  });

  it('picks the PAYMENT_CONFIRMED action by status when fromStatus is not sent', async () => {
    const { service, errand } = build(ErrandStatus.PAYMENT_CONFIRMED);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    await service.adminExpire('e-1', REASON, ADMIN);
    expect(errand.status).toBe(ErrandStatus.EXPIRED);
  });

  it('refuses before the deadline, and without one (deadline_not_passed)', async () => {
    const before = build(ErrandStatus.PAYMENT_CONFIRMED);
    before.errand.deadlineAt = new Date(Date.now() + 60_000);
    expect(await refusal(before.service.adminExpire('e-1', REASON, ADMIN, ErrandStatus.PAYMENT_CONFIRMED))).toMatchObject({
      statusCode: 409,
      code: 'expiry_not_allowed',
      reason: 'deadline_not_passed',
    });
    expect(before.errand.status).toBe(ErrandStatus.PAYMENT_CONFIRMED);
    const none = build(ErrandStatus.PAYMENT_CONFIRMED);
    expect(await refusal(none.service.adminExpire('e-1', REASON, ADMIN))).toMatchObject({ reason: 'deadline_not_passed' });
  });

  it('needs the 10-500 reason too (row 225)', async () => {
    const { service, errand } = build(ErrandStatus.PAYMENT_CONFIRMED);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    expect(await refusal(service.adminExpire('e-1', 'short', ADMIN, ErrandStatus.PAYMENT_CONFIRMED))).toMatchObject({
      statusCode: 400,
      code: 'expiry_reason_invalid',
    });
    expect(errand.status).toBe(ErrandStatus.PAYMENT_CONFIRMED);
  });

  it('PATCH /status cannot do it for an admin, and the system never can', async () => {
    const admin = build(ErrandStatus.PAYMENT_CONFIRMED);
    admin.errand.deadlineAt = new Date(Date.now() - 1_000);
    expect(await refusal(admin.service.transition('e-1', ErrandStatus.EXPIRED, ADMIN, 'note'))).toMatchObject({
      code: 'transition_requires_admin_expiry',
    });
    const system = build(ErrandStatus.PAYMENT_CONFIRMED);
    system.errand.deadlineAt = new Date(Date.now() - 1_000);
    await expect(
      system.service.transition('e-1', ErrandStatus.EXPIRED, { type: StatusHistoryActor.SYSTEM }, undefined, undefined, TransitionGuard.ADMIN_EXPIRY),
    ).rejects.toThrow(/cannot perform/);
    expect(system.errand.status).toBe(ErrandStatus.PAYMENT_CONFIRMED);
  });
});

describe('admin detail canExpire and expiry.fromStatus (round 12 items 6, 7; round 13)', () => {
  const detailOf = async (b: ReturnType<typeof build>, historyRow?: Partial<ErrandStatusHistory>) => {
    Object.assign(b.service, {
      getById: vi.fn(() => Promise.resolve(b.errand)),
      withAssignments: vi.fn((list: Errand[]) => Promise.resolve(list.map((e) => Object.assign({}, e) as Errand))),
      runners: { publicSummaries: vi.fn(() => Promise.resolve(new Map())) },
      history: { findOne: vi.fn(() => Promise.resolve(historyRow ?? null)) },
    });
    return b.service.getDetail('e-1', { role: UserRole.ADMIN, userId: 'admin-1' });
  };

  it('noRunner and deadlinePassed are true only when that expire action would be allowed', async () => {
    expect((await detailOf(build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]))).canExpire).toEqual({
      noRunner: true,
      deadlinePassed: false,
    });
    const remaining = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }], { eligible: 1 });
    expect((await detailOf(remaining)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
    const open = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() + 60_000) }]);
    expect((await detailOf(open)).canExpire?.noRunner).toBe(false);
    const paid = build(ErrandStatus.PAYMENT_CONFIRMED);
    paid.errand.deadlineAt = new Date(Date.now() - 1_000);
    expect((await detailOf(paid)).canExpire).toEqual({ noRunner: false, deadlinePassed: true });
    const early = build(ErrandStatus.PAYMENT_CONFIRMED);
    early.errand.deadlineAt = new Date(Date.now() + 60_000);
    expect((await detailOf(early)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
    const lateAssigned = build(ErrandStatus.RUNNER_ASSIGNED, [{ status: AssignmentStatus.DECLINED }]);
    lateAssigned.errand.deadlineAt = new Date(Date.now() - 1_000);
    expect((await detailOf(lateAssigned)).canExpire).toEqual({ noRunner: false, deadlinePassed: false });
  });

  it('expiry.fromStatus PAYMENT_CONFIRMED for the paid-task expiry', async () => {
    const b = build(ErrandStatus.EXPIRED);
    const view = await detailOf(b, {
      fromStatus: ErrandStatus.PAYMENT_CONFIRMED,
      toStatus: ErrandStatus.EXPIRED,
      actorType: StatusHistoryActor.ADMIN,
      actorId: null,
      note: 'Customer unreachable after the deadline.',
      createdAt: new Date('2026-10-19T10:00:00Z'),
    });
    expect(view.expiry).toMatchObject({ trigger: 'admin', fromStatus: ErrandStatus.PAYMENT_CONFIRMED });
  });

  it('expiry carries fromStatus and the admin trigger', async () => {
    const b = build(ErrandStatus.EXPIRED);
    const view = await detailOf(b, {
      fromStatus: ErrandStatus.RUNNER_ASSIGNED,
      toStatus: ErrandStatus.EXPIRED,
      actorType: StatusHistoryActor.ADMIN,
      actorId: null,
      note: 'No runner works this area.',
      createdAt: new Date('2026-10-19T10:00:00Z'),
    });
    expect(view.expiry).toMatchObject({ trigger: 'admin', fromStatus: ErrandStatus.RUNNER_ASSIGNED, note: 'No runner works this area.' });
  });
});
