import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, UserRole } from '../common/enums';
import { ErrandsController } from './errands.controller';
import { ErrandsService } from './errands.service';

/**
 * Issue #28 (owner, 2026-10-29): a customer receives the merchant's
 * Till/Paybill/account numbers only once the fee payment has completed.
 * Runner and admin views are unchanged.
 */
const service = (lookup?: (ids: string[]) => Promise<Set<string>>) => {
  const s = new ErrandsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
  );
  const spy = vi.fn(lookup ?? (() => Promise.resolve(new Set<string>())));
  if (lookup) {
    s.onFeesPaidLookup(spy);
  }
  return { s, lookup: spy };
};

const paybill = (
  id = 'e-1',
): {
  id: string;
  merchantName: string;
  merchantTillNumber: string | null;
  merchantPaybillNumber: string | null;
  merchantAccountReference: string | null;
  merchantDetailsUpdatedAt: null;
  merchantDetailsAvailable?: boolean;
} => ({
  id,
  merchantName: 'KPLC',
  merchantTillNumber: null,
  merchantPaybillNumber: '888880',
  merchantAccountReference: 'ACC-1',
  merchantDetailsUpdatedAt: null,
});

const till = (id = 'e-2') => ({
  ...paybill(id),
  merchantTillNumber: '123456',
  merchantPaybillNumber: null,
  merchantAccountReference: null,
});

const numbersOf = (v: { merchantTillNumber: unknown; merchantPaybillNumber: unknown; merchantAccountReference: unknown }) => ({
  merchantTillNumber: v.merchantTillNumber,
  merchantPaybillNumber: v.merchantPaybillNumber,
  merchantAccountReference: v.merchantAccountReference,
});

const NONE = { merchantTillNumber: null, merchantPaybillNumber: null, merchantAccountReference: null };

describe('ErrandsService.hideMerchantNumbersFor (issue #28)', () => {
  it('clears the numbers for a customer while the fees are unpaid, keeping name and availability', async () => {
    const { s } = service(() => Promise.resolve(new Set()));
    const [view] = await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [paybill()]);
    expect(numbersOf(view)).toEqual(NONE);
    expect(view.merchantName).toBe('KPLC');
    expect(view.merchantDetailsAvailable).toBe(true);
  });

  it('keeps an existing merchantDetailsAvailable flag as computed', async () => {
    const { s } = service(() => Promise.resolve(new Set()));
    const view = { ...till(), merchantDetailsAvailable: true };
    await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [view]);
    expect(view.merchantDetailsAvailable).toBe(true);
    expect(numbersOf(view)).toEqual(NONE);
  });

  it('returns the numbers unchanged for a customer once the fees are paid', async () => {
    const { s } = service(() => Promise.resolve(new Set(['e-1'])));
    const [view] = await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [paybill()]);
    expect(numbersOf(view)).toEqual({
      merchantTillNumber: null,
      merchantPaybillNumber: '888880',
      merchantAccountReference: 'ACC-1',
    });
    expect(view).not.toHaveProperty('merchantDetailsAvailable');
  });

  it('decides per errand on a list, with one lookup for the errands that carry numbers', async () => {
    const { s, lookup } = service(() => Promise.resolve(new Set(['e-2'])));
    const none = { ...paybill('e-3'), merchantPaybillNumber: null, merchantAccountReference: null };
    const views = await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [paybill('e-1'), till('e-2'), none]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(['e-1', 'e-2']);
    expect(numbersOf(views[0])).toEqual(NONE);
    expect(views[1].merchantTillNumber).toBe('123456');
    expect(numbersOf(views[2])).toEqual(NONE);
  });

  it.each([UserRole.RUNNER, UserRole.ADMIN])('leaves %s views unchanged, before and after payment', async (role) => {
    for (const paid of [new Set<string>(), new Set(['e-1'])]) {
      const { s, lookup } = service(() => Promise.resolve(paid));
      const [view] = await s.hideMerchantNumbersFor({ role }, [paybill()]);
      expect(view).toEqual(paybill());
      expect(lookup).not.toHaveBeenCalled();
    }
  });

  it('fails closed without the payments lookup', async () => {
    const { s } = service();
    const [view] = await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [till()]);
    expect(numbersOf(view)).toEqual(NONE);
    expect(await s.feesPaidAmong(['e-2'])).toEqual(new Set());
  });

  it('makes no lookup when no errand carries numbers', async () => {
    const { s, lookup } = service(() => Promise.resolve(new Set()));
    const view = { ...paybill(), merchantPaybillNumber: null, merchantAccountReference: null };
    await s.hideMerchantNumbersFor({ role: UserRole.CUSTOMER }, [view]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('merchantNumbersVisibleTo: runner and admin always, customer only once paid', async () => {
    const unpaid = service(() => Promise.resolve(new Set())).s;
    const paid = service(() => Promise.resolve(new Set(['e-1']))).s;
    expect(await unpaid.merchantNumbersVisibleTo(UserRole.CUSTOMER, 'e-1')).toBe(false);
    expect(await paid.merchantNumbersVisibleTo(UserRole.CUSTOMER, 'e-1')).toBe(true);
    expect(await unpaid.merchantNumbersVisibleTo(UserRole.RUNNER, 'e-1')).toBe(true);
    expect(await unpaid.merchantNumbersVisibleTo(UserRole.ADMIN, 'e-1')).toBe(true);
  });
});

describe('ErrandsController merchant numbers per role (issue #28)', () => {
  const user = (role: UserRole) => ({ userId: `${role}-1`, role, phone: '+254700000000' }) as never;

  const controller = (paid: boolean) => {
    const { s } = service(() => Promise.resolve(paid ? new Set(['e-1']) : new Set()));
    const view = () => ({ ...paybill(), status: ErrandStatus.ACCEPTED, merchantDetailsAvailable: true });
    Object.assign(s, {
      getDetail: vi.fn(() => Promise.resolve(view())),
      listViewsFor: vi.fn(() => Promise.resolve({ items: [view()], nextCursor: null })),
      updateErrand: vi.fn(() => Promise.resolve(view())),
      requestNewQuote: vi.fn(() => Promise.resolve(view())),
      acceptQuote: vi.fn(() => Promise.resolve({ errand: view(), quote: {} })),
      transition: vi.fn(() => Promise.resolve({ errand: view(), history: {} })),
    });
    return new ErrandsController(s);
  };

  const shapes = (c: ErrandsController, role: UserRole) => [
    ['GET /errands/:id', () => c.get('e-1', user(role))],
    ['GET /errands', () => c.list(user(role), {} as never).then((r) => r.items[0])],
    ['PATCH /errands/:id', () => c.update('e-1', user(role), {} as never)],
    ['POST /errands/:id/quote/request', () => c.requestNewQuote('e-1', user(role))],
    ['POST /errands/:id/quote/accept', () => c.acceptQuote('e-1', user(role)).then((r) => r.errand)],
    ['POST /errands/:id/submit', () => c.submit('e-1', user(role)).then((r) => r.errand)],
    [
      'PATCH /errands/:id/status',
      () => c.transition('e-1', user(role), { to: ErrandStatus.CANCELLED } as never).then((r) => r.errand),
    ],
  ] as const;

  it('customer before payment: every errand response has the numbers null', async () => {
    for (const [name, call] of shapes(controller(false), UserRole.CUSTOMER)) {
      const view = (await call()) as ReturnType<typeof paybill> & { merchantDetailsAvailable?: boolean };
      expect(numbersOf(view), name).toEqual(NONE);
      expect(view.merchantName, name).toBe('KPLC');
      expect(view.merchantDetailsAvailable, name).toBe(true);
    }
  });

  it('customer after payment: the numbers come back unchanged', async () => {
    for (const [name, call] of shapes(controller(true), UserRole.CUSTOMER)) {
      const view = (await call()) as ReturnType<typeof paybill>;
      expect(view.merchantPaybillNumber, name).toBe('888880');
      expect(view.merchantAccountReference, name).toBe('ACC-1');
    }
  });

  it.each([UserRole.RUNNER, UserRole.ADMIN])('%s: unchanged before and after payment (GET /errands/:id)', async (role) => {
    for (const paid of [false, true]) {
      const view = await controller(paid).get('e-1', user(role));
      expect(view.merchantPaybillNumber).toBe('888880');
      expect(view.merchantAccountReference).toBe('ACC-1');
    }
  });
});
