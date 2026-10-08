import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus } from '../common/enums';
import { ErrandsService } from './errands.service';

const build = (status: ErrandStatus) => {
  const errands = {
    findOne: vi.fn(() => Promise.resolve({ id: 'e-1', status })),
    update: vi.fn(() => Promise.resolve({})),
  };
  const emit = vi.fn();
  const service = new ErrandsService(
    {} as never,
    errands as never,
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
  return { service, errands, emit };
};

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : String(e)),
  );

describe('ErrandsService.setMerchantDetails (rows 42-44)', () => {
  it('stores a Till number', async () => {
    const { service, errands } = build(ErrandStatus.ACCEPTED);
    const out = await service.setMerchantDetails('e-1', { merchantName: 'Naivas', tillNumber: '123456' });
    expect(errands.update).toHaveBeenCalledWith('e-1', {
      merchantName: 'Naivas',
      merchantTillNumber: '123456',
      merchantPaybillNumber: null,
      merchantAccountReference: null,
    });
    expect(out).toMatchObject({ merchantTillNumber: '123456' });
  });

  it('emits errand.merchant_details_updated after saving', async () => {
    const { service, emit } = build(ErrandStatus.ACCEPTED);
    await service.setMerchantDetails('e-1', { merchantName: 'Naivas', tillNumber: '123456' });
    await new Promise((r) => setImmediate(r));
    expect(emit).toHaveBeenCalledWith('errand.merchant_details_updated', {
      errandId: 'e-1',
      merchantName: 'Naivas',
      tillNumber: '123456',
      paybillNumber: null,
      accountReference: null,
    });
  });

  it('stores a Paybill with its account reference', async () => {
    const { service, errands } = build(ErrandStatus.IN_PROGRESS);
    await service.setMerchantDetails('e-1', {
      merchantName: 'KPLC',
      paybillNumber: '888880',
      accountReference: 'ACC-1',
    });
    expect(errands.update).toHaveBeenCalledWith('e-1', expect.objectContaining({
      merchantPaybillNumber: '888880',
      merchantAccountReference: 'ACC-1',
    }));
  });

  it('needs exactly one of Till or Paybill', async () => {
    const { service } = build(ErrandStatus.ACCEPTED);
    expect(await codeOf(service.setMerchantDetails('e-1', { merchantName: 'X' }))).toBe(
      'merchant_details_invalid',
    );
    expect(
      await codeOf(
        service.setMerchantDetails('e-1', { merchantName: 'X', tillNumber: '12345', paybillNumber: '54321' }),
      ),
    ).toBe('merchant_details_invalid');
    expect(
      await codeOf(
        service.setMerchantDetails('e-1', { merchantName: 'X', tillNumber: '12345', accountReference: 'A' }),
      ),
    ).toBe('merchant_details_invalid');
  });

  it('refuses closed errands', async () => {
    const { service } = build(ErrandStatus.SETTLED);
    expect(
      await codeOf(service.setMerchantDetails('e-1', { merchantName: 'X', tillNumber: '12345' })),
    ).toBe('errand_closed');
  });
});
