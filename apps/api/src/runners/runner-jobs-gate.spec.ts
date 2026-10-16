import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { RunnerAvailability, RunnerSkill, RunnerVerificationType, VerificationStatus } from '../common/enums';
import { RunnerVerificationSide } from './runner-verification.entity';
import { RunnersService } from './runners.service';
import {
  areasContaining,
  distanceKm,
  listedAreaIds,
  parseServiceAreas,
  serviceAreaOptionsOf,
} from './service-areas';
import { verificationSummaryOf } from './verification-summary';

const codeOf = (p: Promise<unknown> | (() => unknown)) =>
  Promise.resolve()
    .then(() => (typeof p === 'function' ? p() : p))
    .then(
      () => null,
      (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
    );

const AREAS = [
  { id: 'westlands', name: 'Westlands', lat: -1.2676, lng: 36.8108, radiusKm: 3 },
  { id: 'cbd', name: 'CBD', lat: -1.2864, lng: 36.8172, radiusKm: 2 },
];

const v = (type: RunnerVerificationType, status: VerificationStatus, at: number, side: RunnerVerificationSide | null = null) => ({
  verificationType: type,
  status,
  side,
  createdAt: new Date(at),
});

const allApproved = (at = 1) => [
  v(RunnerVerificationType.PHONE, VerificationStatus.APPROVED, at),
  v(RunnerVerificationType.GOVERNMENT_ID, VerificationStatus.APPROVED, at, RunnerVerificationSide.FRONT),
  v(RunnerVerificationType.GOVERNMENT_ID, VerificationStatus.APPROVED, at, RunnerVerificationSide.BACK),
  v(RunnerVerificationType.SELFIE, VerificationStatus.APPROVED, at),
  v(RunnerVerificationType.PAYMENT_IDENTITY, VerificationStatus.APPROVED, at),
];

describe('verificationSummaryOf (RA-8, row 126)', () => {
  it('is verified only when all five required checks are approved', () => {
    expect(verificationSummaryOf(allApproved()).verified).toBe(true);
    const s = verificationSummaryOf(allApproved().slice(0, 4));
    expect(s.verified).toBe(false);
    expect(s.checks.map((c) => c.status)).toEqual(['approved', 'approved', 'approved', 'approved', 'missing']);
  });

  it('takes the newest record per check, so a later rejection or re-upload replaces it', () => {
    const rows = [...allApproved(1), v(RunnerVerificationType.SELFIE, VerificationStatus.REJECTED, 5)];
    expect(verificationSummaryOf(rows).verified).toBe(false);
    rows.push(v(RunnerVerificationType.SELFIE, VerificationStatus.APPROVED, 9));
    expect(verificationSummaryOf(rows).verified).toBe(true);
  });

  it('needs both ID sides; an ID row without a side (pre row 195) does not count', () => {
    const rows = allApproved().filter((r) => r.side !== RunnerVerificationSide.BACK);
    rows.push(v(RunnerVerificationType.GOVERNMENT_ID, VerificationStatus.APPROVED, 3, null));
    const s = verificationSummaryOf(rows);
    expect(s.verified).toBe(false);
    expect(s.checks[2]).toEqual({ type: 'government_id', side: 'back', status: 'missing' });
  });
});

describe('service areas (row 116)', () => {
  it('parses the configured list and refuses malformed entries', () => {
    expect(parseServiceAreas(JSON.stringify(AREAS))).toHaveLength(2);
    expect(parseServiceAreas('')).toEqual([]);
    expect(() => parseServiceAreas('{')).toThrow(/JSON array/);
    expect(() => parseServiceAreas(JSON.stringify([{ ...AREAS[0], id: 'West Lands' }]))).toThrow(/slug/);
    expect(() => parseServiceAreas(JSON.stringify([AREAS[0], AREAS[0]]))).toThrow(/twice/);
    expect(() => parseServiceAreas(JSON.stringify([{ ...AREAS[0], radiusKm: 0 }]))).toThrow(/radiusKm/);
  });

  it('lists options by name and accepts listed ids only', () => {
    expect(serviceAreaOptionsOf(AREAS)).toEqual([
      { id: 'cbd', name: 'CBD' },
      { id: 'westlands', name: 'Westlands' },
    ]);
    expect(listedAreaIds(['cbd', 'cbd', ' westlands '], AREAS)).toEqual(['cbd', 'westlands']);
    const err = (() => {
      try {
        listedAreaIds(['cbd', 'Mombasa'], AREAS);
        return null;
      } catch (e) {
        return e as ApiError;
      }
    })();
    expect(err?.code).toBe('service_area_unknown');
  });

  it('places a point in every area whose circle contains it (proposed rule)', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 0);
    expect(areasContaining({ lat: -1.2864, lng: 36.8172 }, AREAS).sort()).toEqual(['cbd', 'westlands']);
    expect(areasContaining({ lat: -1.319, lng: 36.7073 }, AREAS)).toEqual([]);
  });
});

/** A RunnersService over in-memory rows. */
const build = (opts: { availability?: RunnerAvailability; verified?: boolean } = {}) => {
  const profile = { id: 'rp-1', userId: 'u-1', availability: opts.availability ?? RunnerAvailability.OFFLINE };
  const verifications = opts.verified === false ? [] : allApproved();
  const skillRows: { id: string; runnerProfileId: string; skill: RunnerSkill }[] = [];
  const profileRepo = {
    findOne: vi.fn(() => Promise.resolve({ ...profile })),
    update: vi.fn((_id: string, patch: Partial<typeof profile>) => {
      Object.assign(profile, patch);
      return Promise.resolve({ affected: 1 });
    }),
  };
  const verificationRepo = { find: vi.fn(() => Promise.resolve(verifications)), count: vi.fn(() => Promise.resolve(0)) };
  const skillRepo = {
    find: vi.fn(() => Promise.resolve([...skillRows])),
    delete: vi.fn(({ id }: { id: { _value: string[] } }) => {
      for (const del of id._value) {
        skillRows.splice(skillRows.findIndex((r) => r.id === del), 1);
      }
      return Promise.resolve({});
    }),
    create: vi.fn((r: object) => r),
    save: vi.fn((rows: { runnerProfileId: string; skill: RunnerSkill }[]) => {
      for (const r of rows) {
        skillRows.push({ ...r, id: `s-${skillRows.length + 1}` });
      }
      return Promise.resolve(rows);
    }),
  };
  const areaRepo = { find: vi.fn(() => Promise.resolve([])), delete: vi.fn(), create: vi.fn((r: object) => r), save: vi.fn() };
  const manager = {
    getRepository: (e: { name: string }) =>
      ({ RunnerProfile: profileRepo, RunnerVerification: verificationRepo, RunnerSkillEntity: skillRepo, RunnerServiceArea: areaRepo })[
        e.name
      ],
  };
  const tx = { transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)) };
  const users = { displayNames: vi.fn(() => Promise.resolve(new Map([['u-1', 'Brian Kamau']]))) };
  const config = { get: vi.fn((k: string, d: unknown) => (k === 'runners.serviceAreas' ? AREAS : d)) };
  const service = new RunnersService(
    { ...profileRepo, manager: tx } as never,
    { ...verificationRepo, manager: tx } as never,
    { ...skillRepo, manager: tx } as never,
    { ...areaRepo, manager: tx } as never,
    users as never,
    undefined,
    config as never,
  );
  return { service, profile, manager, skillRows };
};

describe('availability (RA-8, RA-20)', () => {
  it('refuses busy from the client', async () => {
    const { service } = build();
    expect(await codeOf(service.setAvailability('u-1', RunnerAvailability.BUSY))).toBe('availability_server_managed');
  });

  it('refuses online until verified, then allows it', async () => {
    expect(await codeOf(build({ verified: false }).service.setAvailability('u-1', RunnerAvailability.ONLINE))).toBe(
      'runner_not_verified',
    );
    const { service, profile } = build();
    const view = await service.setAvailability('u-1', RunnerAvailability.ONLINE);
    expect(profile.availability).toBe('online');
    expect(view.verification.verified).toBe(true);
    expect(view.shortName).toBe('Brian K.');
  });

  it('lets an unverified runner go offline', async () => {
    const { service, profile } = build({ verified: false, availability: RunnerAvailability.ONLINE });
    await service.setAvailability('u-1', RunnerAvailability.OFFLINE);
    expect(profile.availability).toBe('offline');
  });

  it('while busy: offline is refused, online changes nothing', async () => {
    const { service, profile } = build({ availability: RunnerAvailability.BUSY });
    expect(await codeOf(service.setAvailability('u-1', RunnerAvailability.OFFLINE))).toBe('runner_on_active_job');
    await service.setAvailability('u-1', RunnerAvailability.ONLINE);
    expect(profile.availability).toBe('busy');
  });
});

describe('startJob / endJob (RA-8, RA-20)', () => {
  it('needs a verified, online runner and makes them busy; endJob restores online', async () => {
    const { service, profile, manager } = build({ availability: RunnerAvailability.ONLINE });
    await service.startJob('rp-1', manager as never);
    expect(profile.availability).toBe('busy');
    expect(await codeOf(service.startJob('rp-1', manager as never))).toBe('runner_busy');
    await service.endJob('rp-1', manager as never);
    expect(profile.availability).toBe('online');
  });

  it('refuses an unverified or offline runner', async () => {
    const a = build({ availability: RunnerAvailability.ONLINE, verified: false });
    expect(await codeOf(a.service.startJob('rp-1', a.manager as never))).toBe('runner_not_verified');
    const b = build({ availability: RunnerAvailability.OFFLINE });
    expect(await codeOf(b.service.startJob('rp-1', b.manager as never))).toBe('runner_offline');
  });

  it('endJob leaves an online or offline runner as is', async () => {
    const { service, profile, manager } = build({ availability: RunnerAvailability.OFFLINE });
    await service.endJob('rp-1', manager as never);
    expect(profile.availability).toBe('offline');
  });
});

describe('skills (row 115)', () => {
  it('replaces the skills and returns them in category order', async () => {
    const { service, skillRows } = build();
    await service.setSkills('u-1', [RunnerSkill.INSPECTION, RunnerSkill.BUY_FOR_ME]);
    expect(await service.setSkills('u-1', [RunnerSkill.QUEUE_ADMIN, RunnerSkill.BUY_FOR_ME])).toEqual([
      'buy_for_me',
      'queue_admin',
    ]);
    expect(skillRows.map((r) => r.skill).sort()).toEqual(['buy_for_me', 'queue_admin']);
  });

  it('refuses business (out of MVP, OA-18)', async () => {
    const { service } = build();
    expect(await codeOf(service.setSkills('u-1', [RunnerSkill.BUSINESS]))).toBe('skill_not_offered');
  });
});
