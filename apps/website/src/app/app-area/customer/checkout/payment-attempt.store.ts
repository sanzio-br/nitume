// PaymentAttemptStore (#8 A§3; port of the app's `paymentAttempts`, memory
// instead of secure storage, owner WQ-28): the `Idempotency-Key` of the
// current main-payment attempt per errand, kept for the tab's life. A key
// lost by a reload cannot cause a second charge: while the errand has a
// main payment that has not FAILED, every initiate returns it and pushes
// nothing (API `payments.service.ts` `initiate`).
import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/** Matches the API's `^[A-Za-z0-9_-]{8,128}$`. */
export const PAYMENT_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** `crypto.randomUUID()` (36 chars), else 32 hex chars from `getRandomValues` (non-secure origins). */
export function defaultPaymentKey(source: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const PAYMENT_KEY_FACTORY = new InjectionToken<() => string>('PAYMENT_KEY_FACTORY', {
  providedIn: 'root',
  factory: () => () => defaultPaymentKey(),
});

@Injectable({ providedIn: 'root' })
export class PaymentAttemptStore {
  private readonly factory = inject(PAYMENT_KEY_FACTORY);
  private readonly keys = signal<ReadonlyMap<string, string>>(new Map());

  /** The current attempt's key; created on first use and kept. */
  keyFor(errandId: string): string {
    const existing = this.keys().get(errandId);
    if (existing) return existing;
    return this.newAttempt(errandId);
  }

  /** Starts a new attempt (new key). */
  newAttempt(errandId: string): string {
    const key = this.factory();
    this.keys.update((m) => new Map(m).set(errandId, key));
    return key;
  }
}
