import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrandStatus, PaymentFlow, PaymentTransactionStatus } from '../common/enums';
import { ErrandStateMachine } from '../errands/errand-state-machine';
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

describe('Row 95: nothing becomes payable to the runner before CONFIRMED', () => {
  const sendToRunner = { id: 'p-1', paymentFlow: PaymentFlow.CUSTOMER_TO_RUNNER, merchantAmount: '1000.00' };

  it('only CONFIRMED -> SETTLED makes runner earnings payable (state machine)', () => {
    const into = Object.values(ErrandStatus).filter((from) =>
      ErrandStateMachine.canTransition(from, ErrandStatus.SETTLED),
    );
    expect(into).toEqual([ErrandStatus.CONFIRMED]);
  });

  it.each(
    Object.values(ErrandStatus).filter(
      (s) => s !== ErrandStatus.CONFIRMED && s !== ErrandStatus.SETTLED,
    ),
  )('refuses to settle a paid send_to_runner errand in %s', async (status) => {
    const { service, errands, payments } = build({ statusById: { 'e-1': status } });
    payments.findOne.mockResolvedValue(sendToRunner as never);
    await expect(service.settleErrand('e-1')).rejects.toMatchObject({
      code: status === ErrandStatus.DISPUTED ? 'errand_disputed' : 'errand_not_settleable',
    });
    expect(errands.transition).not.toHaveBeenCalled();
  });

  it('no runner-advance leg exists: the item amount is never advanced', () => {
    const source = readFileSync(join(__dirname, 'payments.service.ts'), 'utf-8');
    expect(source).not.toMatch(/PaymentTypeCode\.RUNNER_ADVANCE|PaymentFlow\.RUNNER_ADVANCE/);
  });
});
