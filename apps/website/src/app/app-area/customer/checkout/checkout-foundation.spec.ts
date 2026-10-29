// A.T2 (G8-3) checkoutRedirect; A.T3, A.T4 (G8-4) the in-memory stores.
import { TestBed } from '@angular/core/testing';
import { ensureLocalStorage, storageKeys } from '../../../../testing/auth';
import { ERRAND_STATUSES, ErrandStatus } from '../../../shared/status/status-presentation';
import { CheckoutIntentStore } from './checkout-intent.store';
import { CheckoutView, checkoutRedirect } from './checkout-routing';
import { PAYMENT_KEY_FACTORY, PAYMENT_KEY_PATTERN, PaymentAttemptStore, defaultPaymentKey } from './payment-attempt.store';

const ID = 'e/1';
const QUOTE = '/app/customer/tasks/e%2F1/quote';
const TRACK = '/app/customer/track/e%2F1';
const DETAIL = '/app/customer/tasks/e%2F1';

/** A§2, row by row: [quote, payment, item-payment]. */
const TABLE: Record<ErrandStatus, [string | null, string | null, string | null]> = {
  DRAFT: [DETAIL, DETAIL, DETAIL],
  REQUESTED: [null, QUOTE, QUOTE],
  QUOTED: [null, QUOTE, QUOTE],
  ACCEPTED: [null, null, QUOTE],
  PAYMENT_CONFIRMED: [TRACK, null, null],
  RUNNER_ASSIGNED: [TRACK, null, null],
  RUNNER_EN_ROUTE: [TRACK, null, null],
  ARRIVED: [TRACK, null, null],
  IN_PROGRESS: [TRACK, null, null],
  AWAITING_CUSTOMER: [TRACK, null, null],
  COMPLETED: [DETAIL, DETAIL, DETAIL],
  CONFIRMED: [DETAIL, DETAIL, DETAIL],
  SETTLED: [DETAIL, DETAIL, DETAIL],
  CANCELLED: [DETAIL, DETAIL, DETAIL],
  FAILED: [DETAIL, DETAIL, DETAIL],
  EXPIRED: [DETAIL, DETAIL, DETAIL],
  DISPUTED: [DETAIL, DETAIL, DETAIL],
};

const VIEWS: CheckoutView[] = ['quote', 'payment', 'item-payment'];

function noStorageWrites(run: () => void): void {
  ensureLocalStorage();
  localStorage.clear();
  sessionStorage.clear();
  const historyState = history.state;
  const push = vi.spyOn(history, 'pushState');
  const replace = vi.spyOn(history, 'replaceState');
  run();
  expect(storageKeys()).toEqual([]);
  expect(history.state).toBe(historyState);
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  push.mockRestore();
  replace.mockRestore();
}

describe('checkout foundation (A§2, A§3)', () => {
  it('A.T2 checkoutRedirect. all 17 statuses × the three views exactly as A§2', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ERRAND_STATUSES].sort());
    for (const status of ERRAND_STATUSES) {
      VIEWS.forEach((view, i) => expect.soft(checkoutRedirect(view, status, ID), `${status} ${view}`).toBe(TABLE[status][i]));
    }
  });

  it('A.T3 CheckoutIntentStore. take returns the intent once, then null; intents are per errand; no storage or history writes', () => {
    noStorageWrites(() => {
      const store = TestBed.inject(CheckoutIntentStore);
      expect(store.take('a')).toBeNull();
      store.set('a', { route: 'send_to_runner', paymentMethodId: 'pm-1', payerDetail: '+254 712 ••• 678' });
      store.set('b', {});
      expect(store.take('a')).toEqual({ route: 'send_to_runner', paymentMethodId: 'pm-1', payerDetail: '+254 712 ••• 678' });
      expect(store.take('a')).toBeNull();
      expect(store.take('b')).toEqual({});
      expect(store.take('b')).toBeNull();
    });
  });

  it('A.T4 PaymentAttemptStore. keyFor is stable in the tab; newAttempt gives a different key; keys match the API pattern; no storage writes', () => {
    noStorageWrites(() => {
      const store = TestBed.inject(PaymentAttemptStore);
      const first = store.keyFor('a');
      expect(first).toMatch(PAYMENT_KEY_PATTERN);
      expect(first).toHaveLength(36);
      expect(store.keyFor('a')).toBe(first);
      expect(store.keyFor('b')).not.toBe(first);
      const second = store.newAttempt('a');
      expect(second).not.toBe(first);
      expect(second).toMatch(PAYMENT_KEY_PATTERN);
      expect(store.keyFor('a')).toBe(second);
    });
  });

  it('A.T4 fallback. without crypto.randomUUID the key is 32 hex chars from getRandomValues and still matches; the factory token is injectable', () => {
    const key = defaultPaymentKey({ getRandomValues: <T extends ArrayBufferView | null>(a: T) => crypto.getRandomValues(a as never) as T });
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).toMatch(PAYMENT_KEY_PATTERN);
    TestBed.configureTestingModule({ providers: [{ provide: PAYMENT_KEY_FACTORY, useValue: () => 'fixed-key-123' }] });
    expect(TestBed.inject(PaymentAttemptStore).keyFor('a')).toBe('fixed-key-123');
  });
});
