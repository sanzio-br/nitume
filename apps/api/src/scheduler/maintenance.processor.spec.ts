import { describe, expect, it, vi } from 'vitest';
import { PAYMENT_VERIFY_JOB } from '../infra/queue/queues';
import {
  DISPUTE_WINDOW_JOB,
  ID_DOCUMENT_PURGE_JOB,
  MaintenanceProcessor,
  OFFER_EXPIRY_JOB,
  STK_RECONCILE_JOB,
} from './maintenance.processor';

const build = () => {
  const errands = {
    confirmPastDisputeWindow: vi.fn(() => Promise.resolve(['e-1'])),
    expireLapsedOffers: vi.fn(() => Promise.resolve(['e-9'])),
    expirePastDeadline: vi.fn(() => Promise.resolve(['e-8'])),
    reportPaidPastDeadline: vi.fn(() => Promise.resolve(['e-7'])),
  };
  const payments = {
    settleConfirmed: vi.fn(() => Promise.resolve(['e-1', 'e-0'])),
    resolveTimedOut: vi.fn(() => Promise.resolve(2)),
    verifyPayment: vi.fn(() => Promise.resolve<string | null>('success')),
  };
  const runners = { purgeExpired: vi.fn(() => Promise.resolve(['v-1'])) };
  return {
    processor: new MaintenanceProcessor(errands as never, payments as never, runners as never),
    errands,
    payments,
    runners,
  };
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

  it('offer-expiry expires tasks past their deadline first (row 185), then lapsed offers (row 141), then reports paid tasks past theirs (rows 201, 220)', async () => {
    const { processor, errands } = build();
    await expect(processor.process({ name: OFFER_EXPIRY_JOB } as never)).resolves.toEqual({
      expired: ['e-9'],
      deadlineExpired: ['e-8'],
      paidPastDeadline: ['e-7'],
    });
    expect(errands.reportPaidPastDeadline).toHaveBeenCalledTimes(1);
    expect(errands.expirePastDeadline.mock.invocationCallOrder[0]).toBeLessThan(
      errands.expireLapsedOffers.mock.invocationCallOrder[0],
    );
  });

  it('stk-reconcile resolves TIMEOUT payments', async () => {
    const { processor, payments } = build();
    await expect(processor.process({ name: STK_RECONCILE_JOB } as never)).resolves.toEqual({ resolved: 2 });
    expect(payments.resolveTimedOut).toHaveBeenCalled();
  });

  it('payment-verify confirms a callback with the provider (row 73)', async () => {
    const { processor, payments } = build();
    await expect(
      processor.process({ name: PAYMENT_VERIFY_JOB, data: { paymentId: 'p-1' } } as never),
    ).resolves.toEqual({ paymentId: 'p-1', state: 'success' });
    expect(payments.verifyPayment).toHaveBeenCalledWith('p-1');
  });

  it('payment-verify throws while still pending so BullMQ retries', async () => {
    const { processor, payments } = build();
    payments.verifyPayment.mockResolvedValueOnce('pending');
    await expect(
      processor.process({ name: PAYMENT_VERIFY_JOB, data: { paymentId: 'p-1' } } as never),
    ).rejects.toThrow(/still pending/);
  });

  it('id-document-purge deletes ID/selfie images past retention (row 154)', async () => {
    const { processor, runners } = build();
    await expect(processor.process({ name: ID_DOCUMENT_PURGE_JOB } as never)).resolves.toEqual({ purged: ['v-1'] });
    expect(runners.purgeExpired).toHaveBeenCalled();
  });
});
