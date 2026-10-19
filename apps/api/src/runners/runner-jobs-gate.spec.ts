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

describe('ensurePhoneVerified (runner _shared.md §9)', () => {
  it('checks and inserts under the profile row lock, once', async () => {
    const rows: object[] = [];
    const lock = vi.fn();
    const verificationRepo = {
      count: vi.fn(() => Promise.resolve(rows.length)),
      create: vi.fn((r: object) => r),
      save: vi.fn((r: object) => {
        rows.push(r);
        return Promise.resolve(r);
      }),
    };
    const profileRepo = {
      findOne: vi.fn((opts: { lock?: unknown }) => {
        if (opts.lock) {
          lock();
        }
        return Promise.resolve({ id: 'rp-1', userId: 'u-1' });
      }),
    };
    const manager = {
      getRepository: (e: { name: string }) => (e.name === 'RunnerProfile' ? profileRepo : verificationRepo),
    };
    const service = new RunnersService(
      { ...profileRepo, manager: { transaction: (fn: (m: unknown) => unknown) => fn(manager) } } as never,
      verificationRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.ensurePhoneVerified('u-1');
    await service.ensurePhoneVerified('u-1');
    expect(rows).toEqual([expect.objectContaining({ verificationType: 'phone', status: 'approved' })]);
    expect(lock).toHaveBeenCalledTimes(2);
  });
});

describe('poolFor: the task pool by identity (rows 115, 116, 126, 212, 213)', () => {
  const approved = (id: string) =>
    allApproved().map((c, i) => ({ ...c, id: `${id}-v${i}`, runnerProfileId: id }));
  const where = (w: Record<string, unknown>) => w as { runnerProfileId?: { value: string[] }; id?: { value: string[] }; area?: { value: string[] } };

  const buildPool = (areas: typeof AREAS | [] = AREAS) => {
    const skills = [
      { runnerProfileId: 'rp-a', skill: RunnerSkill.BUY_FOR_ME },
      { runnerProfileId: 'rp-b', skill: RunnerSkill.BUY_FOR_ME },
      { runnerProfileId: 'rp-c', skill: RunnerSkill.BUY_FOR_ME },
      { runnerProfileId: 'rp-d', skill: RunnerSkill.BUY_FOR_ME },
      { runnerProfileId: 'rp-x', skill: RunnerSkill.INSPECTION },
    ];
    const serviceAreas = [
      { runnerProfileId: 'rp-a', area: 'cbd' },
      { runnerProfileId: 'rp-b', area: 'cbd' },
      { runnerProfileId: 'rp-c', area: 'westlands' },
      { runnerProfileId: 'rp-d', area: 'cbd' },
    ];
    const profiles = ['rp-a', 'rp-b', 'rp-c', 'rp-d', 'rp-x'].map((id) => ({
      id,
      userId: `u-${id}`,
      availability: RunnerAvailability.OFFLINE,
    }));
    const checks = [...approved('rp-a'), ...approved('rp-b'), ...approved('rp-c'), ...approved('rp-x')];
    const skillRepo = {
      find: vi.fn(({ where: w }: { where: { skill: RunnerSkill } }) => Promise.resolve(skills.filter((s) => s.skill === w.skill))),
    };
    const areaRepo = {
      find: vi.fn(({ where: w }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          serviceAreas.filter(
            (a) => where(w).runnerProfileId?.value.includes(a.runnerProfileId) && where(w).area?.value.includes(a.area),
          ),
        ),
      ),
    };
    const profileRepo = {
      find: vi.fn(({ where: w }: { where: Record<string, unknown> }) =>
        Promise.resolve(profiles.filter((p) => where(w).id?.value.includes(p.id))),
      ),
    };
    const verificationRepo = {
      find: vi.fn(({ where: w }: { where: Record<string, unknown> }) =>
        Promise.resolve(checks.filter((c) => where(w).runnerProfileId?.value.includes(c.runnerProfileId))),
      ),
    };
    // rp-b's account is suspended: not returned as active.
    const users = {
      activeDisplayNames: vi.fn((ids: string[]) =>
        Promise.resolve(new Map(ids.filter((id) => id !== 'u-rp-b').map((id) => [id, id === 'u-rp-a' ? 'Amina W' : null]))),
      ),
    };
    const config = { get: vi.fn((k: string, d: unknown) => (k === 'runners.serviceAreas' ? areas : d)) };
    const service = new RunnersService(
      profileRepo as never,
      verificationRepo as never,
      skillRepo as never,
      areaRepo as never,
      users as never,
      undefined,
      config as never,
    );
    return { service };
  };

  it('keeps active, verified runners with the skill whose area contains the task point', async () => {
    const { service } = buildPool();
    // CBD point (not Westlands): rp-a only. rp-b suspended, rp-c in Westlands, rp-d unverified, rp-x other skill.
    const pool = await service.poolFor(RunnerSkill.BUY_FOR_ME, { lat: -1.2864, lng: 36.8172 + 0.015 });
    expect(pool.map((r) => [r.profile.id, r.displayName])).toEqual([['rp-a', 'Amina W']]);
  });

  it('a point inside no configured area has no pool; without areas configured the area rule is skipped', async () => {
    expect(await buildPool().service.poolFor(RunnerSkill.BUY_FOR_ME, { lat: -1.319, lng: 36.7073 })).toEqual([]);
    const noAreas = await buildPool([]).service.poolFor(RunnerSkill.BUY_FOR_ME, { lat: -1.319, lng: 36.7073 });
    expect(noAreas.map((r) => r.profile.id).sort()).toEqual(['rp-a', 'rp-c']);
    const noPoint = await buildPool().service.poolFor(RunnerSkill.BUY_FOR_ME, null);
    expect(noPoint.map((r) => r.profile.id).sort()).toEqual(['rp-a', 'rp-c']);
  });
});

describe('inServiceArea (row 233)', () => {
  const service = (areas: unknown[]) =>
    new RunnersService({} as never, {} as never, {} as never, {} as never, {} as never, undefined, {
      get: vi.fn((k: string, d: unknown) => (k === 'runners.serviceAreas' ? areas : d)),
    } as never);

  it('is true inside an area, false outside, and true while no area is configured', () => {
    expect(service(AREAS).inServiceArea({ lat: -1.2864, lng: 36.8172 })).toBe(true);
    expect(service(AREAS).inServiceArea({ lat: -4.04, lng: 39.7 })).toBe(false);
    expect(service([]).inServiceArea({ lat: -4.04, lng: 39.7 })).toBe(true);
  });
});
