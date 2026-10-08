import { describe, expect, it, vi } from 'vitest';
import { DISPUTE_WINDOW_JOB, MaintenanceProcessor, STK_RECONCILE_JOB } from './maintenance.processor';

const build = () => {
  const errands = { confirmPastDisputeWindow: vi.fn(() => Promise.resolve(['e-1'])) };
  const payments = {
    settleConfirmed: vi.fn(() => Promise.resolve(['e-1', 'e-0'])),
    resolveTimedOut: vi.fn(() => Promise.resolve(2)),
  };
  return { processor: new MaintenanceProcessor(errands as never, payments as never), errands, payments };
};

describe('MaintenanceProcessor (rows 26, 50, 52)', () => {
  it('dispute-window confirms past-window errands, then settles CONFIRMED ones', async () => {
    const { processor, errands, payments } = build();
    const order: string[] = [];
    errands.confirmPastDisputeWindow.mockImplementationOnce(() => {
      order.push('confirm');
      return Promise.resolve(['e-1']);
    });
    payments.settleConfirmed.mockImplementationOnce(() => {
      order.push('settle');
      return Promise.resolve(['e-1']);
    });
    await expect(processor.process({ name: DISPUTE_WINDOW_JOB } as never)).resolves.toEqual({
      confirmed: ['e-1'],
      settled: ['e-1'],
    });
    expect(order).toEqual(['confirm', 'settle']);
  });

  it('stk-reconcile resolves TIMEOUT payments', async () => {
    const { processor, payments } = build();
    await expect(processor.process({ name: STK_RECONCILE_JOB } as never)).resolves.toEqual({ resolved: 2 });
    expect(payments.resolveTimedOut).toHaveBeenCalled();
  });
});
