import { describe, expect, it, vi } from 'vitest';
import { PaymentTypeCode } from '../common/enums';
import { PaymentType } from './payment-type.entity';
import { PAYMENT_TYPES } from './payment-type.reference';
import { PaymentsService } from './payments.service';

/** Row 223: the payment_type seed is race-safe (ON CONFLICT DO NOTHING). */
const build = (existing: PaymentTypeCode[]) => {
  const chain = {
    insert: vi.fn(() => chain),
    into: vi.fn(() => chain),
    values: vi.fn(() => chain),
    orIgnore: vi.fn(() => chain),
    execute: vi.fn(() => Promise.resolve({})),
  };
  const paymentTypes = {
    find: vi.fn(() => Promise.resolve(existing.map((code) => ({ code })))),
    createQueryBuilder: vi.fn(() => chain),
    save: vi.fn(),
  };
  const service = new PaymentsService(
    {} as never,
    {} as never,
    paymentTypes as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, paymentTypes, chain };
};

describe('PaymentsService.onApplicationBootstrap (row 223)', () => {
  it('inserts only the missing codes, ignoring a conflict with a row another instance just wrote', async () => {
    const { service, paymentTypes, chain } = build([PaymentTypeCode.SERVICE_FEE]);
    await service.onApplicationBootstrap();
    expect(chain.into).toHaveBeenCalledWith(PaymentType);
    expect(chain.values).toHaveBeenCalledWith(PAYMENT_TYPES.filter((r) => r.code !== PaymentTypeCode.SERVICE_FEE).map((r) => ({ ...r })));
    expect(chain.orIgnore).toHaveBeenCalledTimes(1);
    expect(chain.execute).toHaveBeenCalledTimes(1);
    // Never the old read-then-save path that collided on IDX_payment_type_code.
    expect(paymentTypes.save).not.toHaveBeenCalled();
  });

  it('writes nothing when every code exists', async () => {
    const { service, paymentTypes } = build(PAYMENT_TYPES.map((r) => r.code));
    await service.onApplicationBootstrap();
    expect(paymentTypes.createQueryBuilder).not.toHaveBeenCalled();
  });
});
