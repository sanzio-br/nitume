import { describe, expect, it, vi } from 'vitest';
import { RunnerAvailability, RunnerVerificationType, VerificationStatus } from '../common/enums';
import { RunnerVerificationSide } from './runner-verification.entity';
import { RunnersService } from './runners.service';

const approved = (type: RunnerVerificationType, side: RunnerVerificationSide | null = null) => ({
  verificationType: type,
  status: VerificationStatus.APPROVED,
  side,
  createdAt: new Date(1),
});

const ALL_APPROVED = [
  approved(RunnerVerificationType.PHONE),
  approved(RunnerVerificationType.GOVERNMENT_ID, RunnerVerificationSide.FRONT),
  approved(RunnerVerificationType.GOVERNMENT_ID, RunnerVerificationSide.BACK),
  approved(RunnerVerificationType.SELFIE),
  approved(RunnerVerificationType.PAYMENT_IDENTITY),
];

/** A RunnersService over one in-memory profile, with a presence double. */
const build = (availability: RunnerAvailability) => {
  const profile = { id: 'rp-1', userId: 'u-1', availability };
  const profileRepo = {
    findOne: vi.fn(() => Promise.resolve({ ...profile })),
    update: vi.fn((_id: string, patch: Partial<typeof profile>) => {
      Object.assign(profile, patch);
      return Promise.resolve({ affected: 1 });
    }),
  };
  const verificationRepo = { find: vi.fn(() => Promise.resolve(ALL_APPROVED)) };
  const empty = { find: vi.fn(() => Promise.resolve([])) };
  const manager = {
    getRepository: (e: { name: string }) =>
      ({ RunnerProfile: profileRepo, RunnerVerification: verificationRepo, RunnerSkillEntity: empty, RunnerServiceArea: empty })[e.name],
  };
  const tx = { transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) };
  const users = { displayNames: vi.fn(() => Promise.resolve(new Map())) };
  const presence = {
    recordAvailability: vi.fn(() => Promise.resolve()),
    viewsOf: vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, { client: 'web', lastPingAt: '2026-10-29T07:58:00.000Z', webPingsStoppedAt: '2026-10-29T08:00:00.000Z' }])),
      ),
    ),
  };
  const service = new RunnersService(
    { ...profileRepo, manager: tx } as never,
    { ...verificationRepo, manager: tx } as never,
    { ...empty, manager: tx } as never,
    { ...empty, manager: tx } as never,
    users as never,
    undefined,
    { get: vi.fn((_k: string, d: unknown) => d) } as never,
    undefined,
    presence as never,
  );
  return { service, profile, presence, manager };
};

describe('setAvailability keeps the presence record in step (issue #36)', () => {
  it('going online restarts the silence clock; going offline clears the flag; no change, no write', async () => {
    const { service, presence } = build(RunnerAvailability.OFFLINE);
    await service.setAvailability('u-1', RunnerAvailability.ONLINE);
    expect(presence.recordAvailability).toHaveBeenLastCalledWith('rp-1', RunnerAvailability.ONLINE);
    await service.setAvailability('u-1', RunnerAvailability.ONLINE);
    expect(presence.recordAvailability).toHaveBeenCalledTimes(1);
    await service.setAvailability('u-1', RunnerAvailability.OFFLINE);
    expect(presence.recordAvailability).toHaveBeenLastCalledWith('rp-1', RunnerAvailability.OFFLINE);
  });
});

describe('setOfflineBySystem (issue #36, owner Q14-6)', () => {
  it('sets an idle online runner offline when the caller re-check passes, inside the lock', async () => {
    const { service, profile, presence, manager } = build(RunnerAvailability.ONLINE);
    const canGo = vi.fn(() => Promise.resolve(true));
    await expect(service.setOfflineBySystem('rp-1', canGo)).resolves.toBe(true);
    expect(canGo).toHaveBeenCalledWith(manager);
    expect(profile.availability).toBe(RunnerAvailability.OFFLINE);
    expect(presence.recordAvailability).toHaveBeenCalledWith('rp-1', RunnerAvailability.OFFLINE);
  });

  it('keeps the runner online when the re-check fails (pinged again, open offer)', async () => {
    const { service, profile, presence } = build(RunnerAvailability.ONLINE);
    await expect(service.setOfflineBySystem('rp-1', () => Promise.resolve(false))).resolves.toBe(false);
    expect(profile.availability).toBe(RunnerAvailability.ONLINE);
    expect(presence.recordAvailability).not.toHaveBeenCalled();
  });

  it('never moves a busy runner (on an active job) and leaves an offline one alone', async () => {
    for (const availability of [RunnerAvailability.BUSY, RunnerAvailability.OFFLINE]) {
      const { service, profile, presence } = build(availability);
      const canGo = vi.fn(() => Promise.resolve(true));
      await expect(service.setOfflineBySystem('rp-1', canGo)).resolves.toBe(false);
      expect(canGo).not.toHaveBeenCalled();
      expect(profile.availability).toBe(availability);
      expect(presence.recordAvailability).not.toHaveBeenCalled();
    }
  });
});

describe('admin runner list presence (issue #36)', () => {
  const listWith = (availability: RunnerAvailability) => {
    const b = build(availability);
    const rows = [{ id: 'rp-1', userId: 'u-1', availability, createdAt: new Date() }];
    const qb = {
      orderBy: vi.fn(() => qb),
      addOrderBy: vi.fn(() => qb),
      limit: vi.fn(() => qb),
      andWhere: vi.fn(() => qb),
      getMany: vi.fn(() => Promise.resolve(rows)),
    };
    const skillsQb = {
      select: vi.fn(() => skillsQb),
      addSelect: vi.fn(() => skillsQb),
      where: vi.fn(() => skillsQb),
      groupBy: vi.fn(() => skillsQb),
      getRawMany: vi.fn(() => Promise.resolve([])),
    };
    Object.assign((b.service as unknown as { profiles: object }).profiles, { createQueryBuilder: () => qb });
    Object.assign((b.service as unknown as { skills: object }).skills, { createQueryBuilder: () => skillsQb });
    return b;
  };

  it('adds presence to every item', async () => {
    const { service } = listWith(RunnerAvailability.BUSY);
    const page = await service.listForAdmin({});
    expect(page.items[0].presence).toEqual({
      client: 'web',
      lastPingAt: '2026-10-29T07:58:00.000Z',
      webPingsStoppedAt: '2026-10-29T08:00:00.000Z',
    });
  });

  it('never shows the flag on an offline runner', async () => {
    const { service } = listWith(RunnerAvailability.OFFLINE);
    const page = await service.listForAdmin({});
    expect(page.items[0].presence).toEqual({ client: 'web', lastPingAt: '2026-10-29T07:58:00.000Z', webPingsStoppedAt: null });
  });
});
