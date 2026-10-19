import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { AssignmentDeclineReason, AssignmentStatus, ErrandStatus, StatusHistoryActor } from '../common/enums';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { ASSIGNMENT_DECLINED_EVENT, ErrandsService, offerExpiryFor } from './errands.service';

const OVER = AssignmentDeclineReason.OVER_PURCHASE_LIMIT;

const build = (status: ErrandStatus, assignments: Partial<ErrandAssignment>[] = []) => {
  const errand = { id: 'e-1', reference: 'NT-1', customerId: 'c-1', status } as Errand;
  const rows = assignments.map((a, i) => ({ id: `a-${i + 1}`, errandId: 'e-1', createdAt: new Date(i), ...a })) as ErrandAssignment[];
  const active = () => rows.filter((r) => r.status === AssignmentStatus.ASSIGNED || r.status === AssignmentStatus.ACCEPTED);
  const repos = new Map<unknown, unknown>([
    [Errand, { findOne: vi.fn(() => Promise.resolve(errand)), save: vi.fn((e: Errand) => Promise.resolve(e)) }],
    [
      RunnerProfile,
      {
        findOne: vi.fn(({ where }: { where: { userId?: string; id?: string } }) =>
          Promise.resolve(where.userId === 'u-run' || where.id === 'rp-1' ? { id: 'rp-1', userId: 'u-run' } : where.id ? { id: where.id } : null),
        ),
      },
    ],
    [
      ErrandAssignment,
      {
        findOne: vi.fn(({ where }: { where: { runnerProfileId?: string; status?: { value?: string[] } } }) =>
          Promise.resolve(
            where.runnerProfileId
              ? (rows
                  .filter(
                    (r) => r.runnerProfileId === where.runnerProfileId && (!where.status || where.status.value?.includes(r.status)),
                  )
                  .at(-1) ?? null)
              : (active().at(-1) ?? null),
          ),
        ),
        count: vi.fn(() => Promise.resolve(active().length)),
        update: vi.fn((id: string, patch: object) => {
          Object.assign(rows.find((r) => r.id === id) ?? {}, patch);
          return Promise.resolve();
        }),
        create: vi.fn((a: object) => a),
        save: vi.fn((a: ErrandAssignment) => {
          if (!rows.includes(a)) {
            rows.push(Object.assign(a, { id: `a-${rows.length + 1}` }));
          }
          return Promise.resolve(a);
        }),
      },
    ],
    [ErrandStatusHistory, { create: vi.fn((r: object) => r), save: vi.fn((r: object) => Promise.resolve(r)) }],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const emit = vi.fn();
  const service = new ErrandsService(
    { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit } as never,
    {} as never,
    {} as never,
  );
  return { service, errand, rows, emit, repos };
};

const tick = () => new Promise((r) => setImmediate(r));

describe('ErrandsService.declineAssignment (row 108)', () => {
  it('declines the current assignment with the reason; the errand keeps RUNNER_ASSIGNED', async () => {
    const { service, errand, rows, emit } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED },
    ]);
    const guard = vi.fn(() => Promise.resolve());
    const out = await service.declineAssignment('e-1', 'u-run', OVER, guard);
    expect(guard).toHaveBeenCalledWith(expect.anything(), { errandId: 'e-1', runnerProfileId: 'rp-1', reason: OVER });
    expect(out).toMatchObject({ status: AssignmentStatus.DECLINED, declineReason: OVER, decidedAt: expect.any(Date) });
    expect(rows[0].status).toBe(AssignmentStatus.DECLINED);
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    await tick();
    expect(emit).toHaveBeenCalledWith('errand.access_changed', { errandId: 'e-1' });
    expect(emit).toHaveBeenCalledWith(ASSIGNMENT_DECLINED_EVENT, {
      errandId: 'e-1',
      reference: 'NT-1',
      assignmentId: 'a-1',
      runnerProfileId: 'rp-1',
      reason: OVER,
    });
  });

  it('refuses after the runner set off, for another runner, and when the guard refuses', async () => {
    const enRoute = build(ErrandStatus.RUNNER_EN_ROUTE, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED }]);
    await expect(enRoute.service.declineAssignment('e-1', 'u-run', OVER)).rejects.toMatchObject({
      code: 'assignment_not_declinable',
    });
    const other = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-2', status: AssignmentStatus.ASSIGNED }]);
    await expect(other.service.declineAssignment('e-1', 'u-run', OVER)).rejects.toBeInstanceOf(ForbiddenException);
    const refused = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED }]);
    await expect(
      refused.service.declineAssignment('e-1', 'u-run', OVER, () => Promise.reject(new Error('within limit'))),
    ).rejects.toThrow('within limit');
    expect(refused.rows[0].status).toBe(AssignmentStatus.ASSIGNED);
    await tick();
    expect(refused.emit).not.toHaveBeenCalled();
  });
});

describe('ErrandsService.assign after a decline or an expired offer (rows 108, 157)', () => {
  it('reassigns a RUNNER_ASSIGNED errand with no active runner without a status change', async () => {
    const { service, errand, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.DECLINED },
    ]);
    const out = await service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    expect(out.history).toBeNull();
    expect(out.assignment).toMatchObject({ runnerProfileId: 'rp-2', status: AssignmentStatus.ASSIGNED });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    expect(rows).toHaveLength(2);
  });

  it('still refuses a second runner while one is active (illegal RUNNER_ASSIGNED -> RUNNER_ASSIGNED)', async () => {
    const { service } = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED }]);
    await expect(
      service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'illegal_transition' });
  });

  it('reassigns after an expired offer the same way (row 157)', async () => {
    const { service, errand, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.EXPIRED, offerExpiresAt: new Date(Date.now() - 1_000) },
    ]);
    const out = await service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    expect(out.history).toBeNull();
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    expect(rows.map((r) => r.status)).toEqual([AssignmentStatus.EXPIRED, AssignmentStatus.ASSIGNED]);
  });

  it('expires an open offer past its deadline that the sweep has not reached, then reassigns (row 157)', async () => {
    const { service, errand, rows, emit } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() - 1_000) },
    ]);
    const out = await service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    expect(out.history).toBeNull();
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    expect(rows[0]).toMatchObject({ status: AssignmentStatus.EXPIRED, decidedAt: expect.any(Date) });
    expect(out.assignment).toMatchObject({ runnerProfileId: 'rp-2', status: AssignmentStatus.ASSIGNED });
    await tick();
    expect(emit).toHaveBeenCalledWith('errand.access_changed', { errandId: 'e-1' });
  });

  it.each([
    ['declined', AssignmentStatus.DECLINED],
    ['let the offer lapse', AssignmentStatus.EXPIRED],
  ])('refuses to re-offer the task to a runner who %s (row 178)', async (_label, status) => {
    const { service, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status }]);
    await expect(service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' })).rejects.toMatchObject({
      status: 409,
      code: 'runner_already_offered',
    });
    expect(rows).toHaveLength(1);
  });

  it('refuses the runner whose open offer just lapsed, after expiring it (row 178)', async () => {
    const { service, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() - 1_000) },
    ]);
    await expect(service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' })).rejects.toMatchObject({
      code: 'runner_already_offered',
    });
    expect(rows).toHaveLength(1);
  });

  it('first assignment still moves PAYMENT_CONFIRMED -> RUNNER_ASSIGNED', async () => {
    const { service, errand } = build(ErrandStatus.PAYMENT_CONFIRMED);
    const out = await service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    expect(errand.status).toBe(ErrandStatus.RUNNER_ASSIGNED);
    expect(out.history).not.toBeNull();
  });
});

describe('general decline and assign checks (rows 113, 178, 185, 186)', () => {
  it('declines without a reason: stored as null, the event says so', async () => {
    const { service, rows, emit } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() + 60_000) },
    ]);
    await service.declineAssignment('e-1', 'u-run', null);
    expect(rows[0]).toMatchObject({ status: AssignmentStatus.DECLINED, declineReason: null });
    await tick();
    expect(emit).toHaveBeenCalledWith(ASSIGNMENT_DECLINED_EVENT, expect.objectContaining({ reason: null }));
  });

  it('refuses a decline after the offer deadline, before and after the sweep (409 offer_expired)', async () => {
    const past = new Date(Date.now() - 1_000);
    const open = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED, offerExpiresAt: past }]);
    await expect(open.service.declineAssignment('e-1', 'u-run', null)).rejects.toMatchObject({ code: 'offer_expired' });
    expect(open.rows[0].status).toBe(AssignmentStatus.ASSIGNED);
    const swept = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.EXPIRED, offerExpiresAt: past }]);
    await expect(swept.service.declineAssignment('e-1', 'u-run', null)).rejects.toMatchObject({ code: 'offer_expired' });
  });

  it('refuses to assign once the task deadline has passed (409 task_deadline_passed)', async () => {
    const { service, errand, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.DECLINED },
    ]);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    await expect(service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' })).rejects.toMatchObject({
      code: 'task_deadline_passed',
    });
    expect(rows).toHaveLength(1);
  });

  it('refuses to assign a PAYMENT_CONFIRMED task past its deadline: no indirect expiry path (rows 201, 214)', async () => {
    const { service, errand, rows } = build(ErrandStatus.PAYMENT_CONFIRMED);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    const err = await service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).getResponse()).toMatchObject({
      statusCode: 409,
      code: 'task_deadline_passed',
      deadlineAt: errand.deadlineAt.toISOString(),
    });
    expect(errand.status).toBe(ErrandStatus.PAYMENT_CONFIRMED);
    expect(rows).toHaveLength(0);
  });

  it('caps a new offer at the task deadline when it comes before the window ends (row 205)', async () => {
    const soon = build(ErrandStatus.PAYMENT_CONFIRMED);
    soon.errand.deadlineAt = new Date(Date.now() + 60_000);
    const capped = await soon.service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    expect(capped.assignment.offerExpiresAt).toEqual(soon.errand.deadlineAt);

    const later = build(ErrandStatus.PAYMENT_CONFIRMED);
    later.errand.deadlineAt = new Date(Date.now() + 3 * 3_600_000);
    const before = Date.now();
    const full = await later.service.assign('e-1', 'rp-1', { type: StatusHistoryActor.ADMIN, id: 'admin-1' });
    const ms = (full.assignment.offerExpiresAt as Date).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(600_000 - 50);
    expect(ms).toBeLessThan(600_000 + 1_000);
  });

  it('offerExpiryFor: min(now + window, deadlineAt); no deadline = the full window', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    expect(offerExpiryFor({ deadlineAt: null }, 600, now)).toEqual(new Date('2026-10-19T10:10:00Z'));
    expect(offerExpiryFor({ deadlineAt: new Date('2026-10-19T10:04:00Z') }, 600, now)).toEqual(new Date('2026-10-19T10:04:00Z'));
    expect(offerExpiryFor({ deadlineAt: new Date('2026-10-19T12:00:00Z') }, 600, now)).toEqual(new Date('2026-10-19T10:10:00Z'));
    expect(offerExpiryFor(null, 90, now)).toEqual(new Date('2026-10-19T10:01:30Z'));
  });

  it('refuses a decline once the task deadline passed, even on an older uncapped offer (row 205)', async () => {
    const { service, errand, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [
      { runnerProfileId: 'rp-1', status: AssignmentStatus.ASSIGNED, offerExpiresAt: new Date(Date.now() + 60_000) },
    ]);
    errand.deadlineAt = new Date(Date.now() - 1_000);
    const err = await service.declineAssignment('e-1', 'u-run', null).catch((e: unknown) => e);
    expect((err as ApiError).getResponse()).toMatchObject({
      code: 'offer_expired',
      reason: 'task_deadline_passed',
      deadlineAt: errand.deadlineAt.toISOString(),
    });
    expect(rows[0].status).toBe(AssignmentStatus.ASSIGNED);
  });

  it('runs the assign guards before writing the offer', async () => {
    const { service, rows } = build(ErrandStatus.RUNNER_ASSIGNED, [{ runnerProfileId: 'rp-1', status: AssignmentStatus.DECLINED }]);
    const guard = vi.fn(() => Promise.reject(new Error('runner_not_eligible')));
    service.onAssign(guard);
    await expect(service.assign('e-1', 'rp-2', { type: StatusHistoryActor.ADMIN, id: 'admin-1' })).rejects.toThrow('runner_not_eligible');
    expect(guard).toHaveBeenCalledWith(expect.anything(), { errandId: 'e-1', runnerProfileId: 'rp-2' });
    expect(rows).toHaveLength(1);
  });
});
