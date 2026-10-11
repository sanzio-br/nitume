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
    update: vi.fn(() => Promise.resolve({})),
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
  const emit = vi.fn();
  const service = new ErrandsService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit } as never,
    {} as never,
    quoteRepo as never,
  );
  return { service, errand, errandRepo, quoteRepo, historyRepo, emit };
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
    expect(errandRepo.update).toHaveBeenCalledWith('e-1', {
      quotedPrice: '650.00',
      quoteRequestedAt: null,
    });
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

describe('Admin re-quote on ACCEPTED (row 72)', () => {
  it('writes a fresh quote without a status change, runs the guards and emits quote.reissued', async () => {
    const { service, errand, historyRepo, emit } = build(ErrandStatus.ACCEPTED, {
      id: 'q-1',
      expiresAt: past,
      acceptedAt: past,
    });
    const guard = vi.fn(() => Promise.resolve());
    service.onRequote(guard);
    const out = await service.quote('e-1', { total: 700, expiresAt: future.toISOString() }, admin);
    expect(errand.status).toBe(ErrandStatus.ACCEPTED);
    expect(out.history).toBeNull();
    expect(historyRepo.save).not.toHaveBeenCalled();
    expect(guard).toHaveBeenCalledWith(expect.anything(), 'e-1');
    await new Promise((r) => setImmediate(r));
    expect(emit).toHaveBeenCalledWith('quote.reissued', {
      errandId: 'e-1',
      quoteId: 'q-new',
      total: '700.00',
      currency: 'KES',
      expiresAt: future.toISOString(),
      status: ErrandStatus.ACCEPTED,
      acceptanceRequired: true,
    });
  });

  it('is refused when a guard throws (payment in flight)', async () => {
    const { service, quoteRepo } = build(ErrandStatus.ACCEPTED, { id: 'q-1', expiresAt: past });
    service.onRequote(() => Promise.reject(new ApiError(409, 'payment_in_progress', 'busy')));
    expect(await codeOf(service.quote('e-1', { total: 700 }, admin))).toBe('payment_in_progress');
    expect(quoteRepo.save).not.toHaveBeenCalled();
  });

  it('keeps an ACCEPTED quote that has not expired (quote_still_valid)', async () => {
    const { service } = build(ErrandStatus.ACCEPTED, { id: 'q-1', expiresAt: future });
    expect(await codeOf(service.quote('e-1', { total: 700 }, admin))).toBe('quote_still_valid');
  });

  it('records acceptance on the quote when QUOTED -> ACCEPTED', async () => {
    const { service, quoteRepo } = build(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: future });
    await service.transition('e-1', ErrandStatus.ACCEPTED, customer, undefined, subject);
    expect(quoteRepo.update).toHaveBeenCalledWith('q-1', { acceptedAt: expect.any(Date) });
  });
});

describe('ErrandsService.acceptQuote (row 72)', () => {
  const withDetail = (status: ErrandStatus, latest: Partial<Quote> | null) => {
    const built = build(status, latest);
    vi.spyOn(built.service, 'getById').mockResolvedValue(built.errand);
    vi.spyOn(built.service, 'getDetail').mockResolvedValue(built.errand as never);
    return built;
  };

  it('records acceptance of a re-quote on an ACCEPTED errand', async () => {
    const { service, quoteRepo, errand } = withDetail(ErrandStatus.ACCEPTED, {
      id: 'q-2',
      expiresAt: future,
      acceptedAt: null,
    });
    const out = await service.acceptQuote('e-1', subject);
    expect(quoteRepo.update).toHaveBeenCalledWith('q-2', { acceptedAt: expect.any(Date) });
    expect(out.quote.acceptedAt).toBeInstanceOf(Date);
    expect(errand.status).toBe(ErrandStatus.ACCEPTED);
  });

  it('is idempotent once the newest quote is accepted', async () => {
    const { service, quoteRepo } = withDetail(ErrandStatus.ACCEPTED, {
      id: 'q-2',
      expiresAt: future,
      acceptedAt: past,
    });
    await service.acceptQuote('e-1', subject);
    expect(quoteRepo.update).not.toHaveBeenCalled();
  });

  it('refuses an expired re-quote with quote_expired', async () => {
    const { service } = withDetail(ErrandStatus.ACCEPTED, { id: 'q-2', expiresAt: past, acceptedAt: null });
    expect(await codeOf(service.acceptQuote('e-1', subject))).toBe('quote_expired');
  });

  it('moves QUOTED -> ACCEPTED', async () => {
    const { service, errand } = withDetail(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: future });
    await service.acceptQuote('e-1', subject);
    expect(errand.status).toBe(ErrandStatus.ACCEPTED);
  });

  it('409 quote_not_acceptable in other states', async () => {
    const { service } = withDetail(ErrandStatus.PAYMENT_CONFIRMED, { id: 'q-1', expiresAt: future });
    expect(await codeOf(service.acceptQuote('e-1', subject))).toBe('quote_not_acceptable');
  });
});

describe('ErrandsService.payableQuote (row 72)', () => {
  it('returns the newest accepted, unexpired quote', async () => {
    const { service } = build(ErrandStatus.ACCEPTED, { id: 'q-1', expiresAt: future, acceptedAt: past });
    await expect(service.payableQuote('e-1')).resolves.toMatchObject({ id: 'q-1' });
  });

  it('409 quote_not_accepted for an unaccepted re-quote, quote_expired for an expired one', async () => {
    const pending = build(ErrandStatus.ACCEPTED, { id: 'q-2', expiresAt: future, acceptedAt: null });
    expect(await codeOf(pending.service.payableQuote('e-1'))).toBe('quote_not_accepted');
    const expired = build(ErrandStatus.ACCEPTED, { id: 'q-2', expiresAt: past, acceptedAt: past });
    expect(await codeOf(expired.service.payableQuote('e-1'))).toBe('quote_expired');
  });
});

describe('Every quote expires (row 83)', () => {
  it('defaults to now + 24h when the admin omits expiresAt', async () => {
    const { service, quoteRepo } = build(ErrandStatus.REQUESTED, null);
    const before = Date.now();
    await service.quote('e-1', { total: 650 }, admin);
    const saved = quoteRepo.create.mock.calls[0][0] as { expiresAt: Date };
    expect(saved.expiresAt).toBeInstanceOf(Date);
    const ttl = saved.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(24 * 3_600_000 - 1_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3_600_000 + 1_000);
  });

  it('uses QUOTES_DEFAULT_TTL_HOURS when configured', () => {
    const { service } = build(ErrandStatus.REQUESTED, null);
    Object.assign(service, {
      config: { get: (key: string, d: unknown) => (key === 'quotes.defaultTtlHours' ? 6 : d) },
    });
    const now = new Date('2026-10-09T10:00:00Z');
    expect(service.quoteExpiryFor(undefined, now).toISOString()).toBe('2026-10-09T16:00:00.000Z');
  });

  it('keeps an explicit future expiry', async () => {
    const { service, quoteRepo } = build(ErrandStatus.REQUESTED, null);
    await service.quote('e-1', { total: 650, expiresAt: future.toISOString() }, admin);
    const saved = quoteRepo.create.mock.calls[0][0] as { expiresAt: Date };
    expect(saved.expiresAt.toISOString()).toBe(future.toISOString());
  });

  it('refuses an expiry that is not in the future (quote_expiry_in_past)', async () => {
    const { service, quoteRepo, errand } = build(ErrandStatus.REQUESTED, null);
    expect(
      await codeOf(service.quote('e-1', { total: 650, expiresAt: past.toISOString() }, admin)),
    ).toBe('quote_expiry_in_past');
    expect(quoteRepo.save).not.toHaveBeenCalled();
    // The transition is in the same transaction, which rolls back in the DB.
    expect(errand.id).toBe('e-1');
  });

  it('re-quote of an expired quote also gets the default expiry', async () => {
    const { service, quoteRepo } = build(ErrandStatus.QUOTED, { id: 'q-1', expiresAt: past });
    await service.quote('e-1', { total: 700 }, admin);
    const saved = quoteRepo.create.mock.calls[0][0] as { expiresAt: Date | null };
    expect(saved.expiresAt).toBeInstanceOf(Date);
  });
});

describe('ErrandsService.requestNewQuote (row 68)', () => {
  const setup = (status: ErrandStatus, latest: Partial<Quote> | null, requestedAt: Date | null = null) => {
    const built = build(status, latest);
    Object.assign(built.errand, { reference: 'NT-10001', quoteRequestedAt: requestedAt });
    const getById = vi.spyOn(built.service, 'getById').mockResolvedValue(built.errand);
    vi.spyOn(built.service, 'getDetail').mockResolvedValue(built.errand as never);
    return { ...built, getById };
  };

  it('records the request on an expired quote without a status change and notifies admins', async () => {
    const { service, errand, errandRepo, emit, historyRepo, getById } = setup(ErrandStatus.QUOTED, {
      id: 'q-1',
      expiresAt: past,
    });
    await service.requestNewQuote('e-1', subject);
    expect(getById).toHaveBeenCalledWith('e-1', subject);
    expect(errandRepo.update).toHaveBeenCalledWith('e-1', { quoteRequestedAt: expect.any(Date) });
    expect(errand.status).toBe(ErrandStatus.QUOTED);
    expect(historyRepo.save).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emit).toHaveBeenCalledWith('quote.requested', {
      errandId: 'e-1',
      reference: 'NT-10001',
      quoteId: 'q-1',
      status: ErrandStatus.QUOTED,
      quoteRequestedAt: expect.any(String),
    });
  });

  it('works on an ACCEPTED errand whose quote expired', async () => {
    const { service, errandRepo } = setup(ErrandStatus.ACCEPTED, {
      id: 'q-1',
      expiresAt: past,
      acceptedAt: past,
    });
    await service.requestNewQuote('e-1', subject);
    expect(errandRepo.update).toHaveBeenCalledTimes(1);
  });

  it('409 quote_still_valid while the quote is valid (or has no expiry)', async () => {
    for (const expiresAt of [future, null]) {
      const { service, errandRepo, emit } = setup(ErrandStatus.QUOTED, { id: 'q-1', expiresAt });
      expect(await codeOf(service.requestNewQuote('e-1', subject))).toBe('quote_still_valid');
      expect(errandRepo.update).not.toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      expect(emit).not.toHaveBeenCalled();
    }
  });

  it('409 quote_request_pending on a repeat request (idempotent, no second notification)', async () => {
    const { service, errandRepo, emit } = setup(
      ErrandStatus.QUOTED,
      { id: 'q-1', expiresAt: past },
      new Date('2026-10-09T10:00:00Z'),
    );
    const err = await service.requestNewQuote('e-1', subject).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('quote_request_pending');
    expect((err as ApiError).getResponse()).toMatchObject({
      quoteRequestedAt: '2026-10-09T10:00:00.000Z',
    });
    expect(errandRepo.update).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });

  it('409 quote_request_not_allowed outside QUOTED/ACCEPTED or without a quote', async () => {
    const paid = setup(ErrandStatus.PAYMENT_CONFIRMED, { id: 'q-1', expiresAt: past });
    expect(await codeOf(paid.service.requestNewQuote('e-1', subject))).toBe('quote_request_not_allowed');
    const none = setup(ErrandStatus.QUOTED, null);
    expect(await codeOf(none.service.requestNewQuote('e-1', subject))).toBe('quote_request_not_allowed');
  });

  it('the admin re-quote clears the pending request', async () => {
    const { service, errand, errandRepo } = setup(
      ErrandStatus.QUOTED,
      { id: 'q-1', expiresAt: past },
      new Date(),
    );
    await service.quote('e-1', { total: 700 }, admin);
    expect(errandRepo.update).toHaveBeenCalledWith('e-1', {
      quotedPrice: '700.00',
      quoteRequestedAt: null,
    });
    expect(errand.quoteRequestedAt).toBeNull();
  });
});
