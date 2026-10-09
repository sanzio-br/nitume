import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, PaymentTransactionStatus } from '../common/enums';
import { PaymentsService } from './payments.service';

const build = (opts: { statusById: Record<string, ErrandStatus>; legStatus?: PaymentTransactionStatus }) => {
  const payments = { findOne: vi.fn(() => Promise.resolve({ id: 'p-1' })) };
  const transactions = {
    find: vi.fn(() =>
      Promise.resolve([{ id: 't-1', status: opts.legStatus ?? PaymentTransactionStatus.COMPLETED }]),
    ),
  };
  const errands = {
    idsInStatus: vi.fn(() => Promise.resolve(Object.keys(opts.statusById))),
    getById: vi.fn((id: string) => Promise.resolve({ id, status: opts.statusById[id] })),
    transition: vi.fn(() => Promise.resolve({})),
  };
  const service = new PaymentsService(
    payments as never,
    transactions as never,
    {} as never,
    {} as never,
    errands as never,
    {} as never,
    { get: (_k: string, d: unknown) => d } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, errands, payments };
};

describe('PaymentsService.settleConfirmed (row 50)', () => {
  it('moves CONFIRMED errands with completed legs to SETTLED as system', async () => {
    const { service, errands, payments } = build({ statusById: { 'e-1': ErrandStatus.CONFIRMED } });
    await expect(service.settleConfirmed()).resolves.toEqual(['e-1']);
    expect(errands.idsInStatus).toHaveBeenCalledWith(ErrandStatus.CONFIRMED, 100);
    expect(errands.transition).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.SETTLED,
      { type: 'system' },
      expect.any(String),
    );
    // Uses the active main payment, never a failed attempt or a difference.
    expect(payments.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ errandId: 'e-1', priceChangeRequestId: expect.anything() }),
    });
  });

  it('skips errands whose legs are not complete and keeps going', async () => {
    const { service, errands } = build({
      statusById: { 'e-1': ErrandStatus.CONFIRMED },
      legStatus: PaymentTransactionStatus.INITIATED,
    });
    await expect(service.settleConfirmed()).resolves.toEqual([]);
    expect(errands.transition).not.toHaveBeenCalled();
  });
});
