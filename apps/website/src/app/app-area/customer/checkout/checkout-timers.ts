// The #8 pages' timers (A§7): polls, the expiry tick and the SUCCESS delay.
// A token so tests step time without faking the global clock; the default
// runs outside the zone (as Home's poll) so a pending poll never keeps the
// app from settling, and re-enters it to update the view.
import { InjectionToken, NgZone, inject } from '@angular/core';

export interface CheckoutTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const CHECKOUT_TIMERS = new InjectionToken<CheckoutTimers>('CHECKOUT_TIMERS', {
  providedIn: 'root',
  factory: () => {
    const zone = inject(NgZone);
    return {
      setTimeout: (fn, ms) => zone.runOutsideAngular(() => setTimeout(() => zone.run(fn), ms)),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  },
});

/** A repeating timer on `CheckoutTimers`; `stop()` cancels it. */
export function every(timers: CheckoutTimers, ms: number, fn: () => void): { stop: () => void } {
  let handle: unknown = null;
  let stopped = false;
  const schedule = () => {
    handle = timers.setTimeout(() => {
      if (stopped) return;
      fn();
      schedule();
    }, ms);
  };
  schedule();
  return {
    stop: () => {
      stopped = true;
      if (handle !== null) timers.clearTimeout(handle);
    },
  };
}
