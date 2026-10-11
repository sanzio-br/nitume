import { describe, expect, it, vi } from 'vitest';
import { MerchantDetailsWatcher } from './merchant-details.watcher';

const event = (over: Record<string, unknown> = {}) => ({
  errandId: 'e-1',
  merchantName: 'Naivas',
  tillNumber: '654321',
  paybillNumber: null,
  accountReference: null,
  changed: true,
  merchantDetailsUpdatedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});

const build = (started: boolean | Error) => {
  const payments = {
    merchantDirectStarted: vi.fn(() =>
      started instanceof Error ? Promise.reject(started) : Promise.resolve(started),
    ),
  };
  const events = { emit: vi.fn() };
  return { watcher: new MerchantDetailsWatcher(payments as never, events as never), payments, events };
};

describe('MerchantDetailsWatcher (row 80)', () => {
  it('emits merchant_details.changed when a merchant-direct payment has started', async () => {
    const { watcher, events } = build(true);
    await watcher.onMerchantDetailsUpdated(event());
    expect(events.emit).toHaveBeenCalledWith('merchant_details.changed', {
      errandId: 'e-1',
      merchantName: 'Naivas',
      tillNumber: '654321',
      paybillNumber: null,
      accountReference: null,
      merchantDetailsUpdatedAt: '2026-10-09T10:00:00.000Z',
    });
  });

  it('stays quiet without a started merchant-direct payment', async () => {
    const { watcher, events } = build(false);
    await watcher.onMerchantDetailsUpdated(event());
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('ignores a first entry (not a change)', async () => {
    const { watcher, payments, events } = build(true);
    await watcher.onMerchantDetailsUpdated(event({ changed: false, merchantDetailsUpdatedAt: null }));
    expect(payments.merchantDirectStarted).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('never throws (the details are already saved)', async () => {
    const { watcher, events } = build(new Error('db down'));
    await expect(watcher.onMerchantDetailsUpdated(event())).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
