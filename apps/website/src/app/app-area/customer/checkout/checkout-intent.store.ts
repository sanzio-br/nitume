// CheckoutIntentStore (#8 A§3; owner WQ-28): the in-app "pay now" intent
// (the Flutter `fromCheckout: true`). Written by the checkout CTA, Home's
// `Pay now →` (a plain left click it follows in-app) and Task detail's
// `Pay now` (#9); read once by `v-payment` to decide whether it may send
// an STK prompt. Memory only: a reload, a link, a new tab or a second tab
// has no intent, so it never sends a prompt by itself.
import { Injectable, signal } from '@angular/core';
import type { MerchantRoute } from '../data/checkout.api';

export interface CheckoutIntent {
  readonly route?: MerchantRoute;
  readonly paymentMethodId?: string;
  /** Masked or full payer number chosen at checkout (body line). */
  readonly payerDetail?: string;
}

@Injectable({ providedIn: 'root' })
export class CheckoutIntentStore {
  private readonly intents = signal<ReadonlyMap<string, CheckoutIntent>>(new Map());

  set(errandId: string, intent: CheckoutIntent): void {
    this.intents.update((m) => new Map(m).set(errandId, { ...intent }));
  }

  /** Returns the errand's intent and clears it (once); null when there is none. */
  take(errandId: string): CheckoutIntent | null {
    const intent = this.intents().get(errandId) ?? null;
    if (intent) {
      this.intents.update((m) => {
        const next = new Map(m);
        next.delete(errandId);
        return next;
      });
    }
    return intent;
  }
}
