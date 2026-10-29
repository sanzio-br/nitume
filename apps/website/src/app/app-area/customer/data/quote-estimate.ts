// Price estimate seam for the review step (customer-v-new-review §Data, row
// 47). No preview endpoint exists and none may be invented, so the default
// returns null without any HTTP call (the unavailable state), exactly as
// the built app. Variant B shows only when `quotePreviewEnabled` is on.
import { InjectionToken } from '@angular/core';
import { environment } from '../../../../environments/environment';
import type { CreateErrandBody } from './errands.api';

export interface QuoteEstimateResult {
  readonly total: string;
  readonly itemAmount: string | null;
}

export interface QuoteEstimate {
  estimate(body: CreateErrandBody): Promise<QuoteEstimateResult | null>;
}

export const QUOTE_ESTIMATE = new InjectionToken<QuoteEstimate>('QUOTE_ESTIMATE', {
  providedIn: 'root',
  factory: () => ({ estimate: async () => null }),
});

/** `environment.quotePreviewEnabled` (a token so tests can turn it on). */
export const QUOTE_PREVIEW_ENABLED = new InjectionToken<boolean>('QUOTE_PREVIEW_ENABLED', {
  providedIn: 'root',
  factory: () => environment.quotePreviewEnabled,
});
