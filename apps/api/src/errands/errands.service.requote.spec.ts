import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus, StatusHistoryActor, UserRole } from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { ErrandsService, assertQuoteCurrent } from './errands.service';
import { Quote } from './quote.entity';

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 3_600_000);

const build = (status: ErrandStatus, latest: Partial<Quote> | null) => {
  const errand = { id: 'e-1', customerId: 'cust-1', status, quotedPrice: '500.00' } as Errand;
  const errandRepo = {
    findOne: vi.fn(() => Promise.resolve(errand)),
    save: vi.fn((e: Errand) => Promise.resolve(e)),
    update: vi.fn(() => Promise.resolve({})),
  };
  const quoteRepo = {
    findOne: vi.fn(() => Promise.resolve(latest)),
    create: vi.fn((r: object) => r),
    save: vi.fn((r: object) => Promise.resolve({ id: 'q-new', ...r })),
  };
  const historyRepo = {
    create: vi.fn((r: object) => r),
    save: vi.fn((r: object) => Promise.resolve(r)),
  };
  const repos = new Map<unknown, unknown>([
    [Errand, errandRepo],
    [Quote, quoteRepo],
    [ErrandStatusHistory, historyRepo],
    [CustomerProfile, { findOne: vi.fn(() => Promise.resolve({ id: 'cust-1' })) }],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const dataSource = { transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const service = new ErrandsService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    {} as never,
    quoteRepo as never,
  );
  return { service, errand, errandRepo, quoteRepo, historyRepo };
};

const admin = { type: StatusHistoryActor.ADMIN, id: 'admin-1' };
const customer = { type: StatusHistoryActor.CUSTOMER, id: 'user-1' };
const subject = { role: UserRole.CUSTOMER, userId: 'user-1' };

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

describe('assertQuoteCurrent', () => {
  it('passes for no expiry or a future expiry and throws quote_expired after it', () => {
    expect(() => assertQuoteCurrent(null)).not.toThrow();
    expect(() => assertQuoteCurrent({ id: 'q', expiresAt: null })).not.toThrow();
    expect(() => assertQuoteCurrent({ id: 'q', expiresAt: future })).not.toThrow();
    expect(() => assertQuoteCurrent({ id: 'q', expiresAt: past })).toThrow(ApiError);
  });
});

describe('Quote expiry on accept (row 46)', () => {
  it('refuses QUOTED -> ACCEPTED on an expired quote with quote_expired', async () => {
    const { service, errand } = build(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: past });
    expect(
      await codeOf(service.transition('e-1', ErrandStatus.ACCEPTED, customer, undefined, subject)),
    ).toBe('quote_expired');
    expect(errand.status).toBe(ErrandStatus.QUOTED);
  });

  it('accepts a quote that is still valid', async () => {
    const { service, errand } = build(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: future });
    await service.transition('e-1', ErrandStatus.ACCEPTED, customer, undefined, subject);
    expect(errand.status).toBe(ErrandStatus.ACCEPTED);
  });
});

describe('Admin re-quote (row 46)', () => {
  it('writes a fresh quote on an expired QUOTED errand without a status change', async () => {
    const { service, errand, quoteRepo, historyRepo, errandRepo } = build(ErrandStatus.QUOTED, {
      id: 'q-1',
      expiresAt: past,
    });
    const out = await service.quote('e-1', { total: 650, expiresAt: future.toISOString() }, admin);
    expect(out.history).toBeNull();
    expect(out.quote).toMatchObject({ id: 'q-new', total: '650' });
    expect(errand.status).toBe(ErrandStatus.QUOTED);
    expect(errandRepo.update).toHaveBeenCalledWith('e-1', { quotedPrice: '650.00' });
    expect(quoteRepo.save).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).not.toHaveBeenCalled();
  });

  it('keeps a quote that has not expired (quote_still_valid)', async () => {
    const { service, quoteRepo } = build(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: future });
    expect(await codeOf(service.quote('e-1', { total: 650 }, admin))).toBe('quote_still_valid');
    expect(quoteRepo.save).not.toHaveBeenCalled();
  });

  it('still prices a REQUESTED errand through REQUESTED -> QUOTED', async () => {
    const { service, errand, historyRepo } = build(ErrandStatus.REQUESTED, null);
    const out = await service.quote('e-1', { total: 650 }, admin);
    expect(errand.status).toBe(ErrandStatus.QUOTED);
    expect(out.history).not.toBeNull();
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });
});
