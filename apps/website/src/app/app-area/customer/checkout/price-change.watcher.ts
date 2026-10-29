// CustomerPriceChangeWatcher (customer-v-price-auth.md "Entry / exit"; port
// of the app shell's `_onLivePrice` / `_checkPendingPriceChange`). Provided
// on the customer shell route only (never in app.config.ts, never for
// runners): a live `price_change:requested` for an IN_PROGRESS errand, and
// a "resume" check on shell start and whenever the tab becomes visible
// (IN_PROGRESS errands, then each one's pending request), open the blocking
// price-change dialog. Single flight; failures are silent (Track also shows
// the request).
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { CheckoutApi, CheckoutErrand, PriceChangeRequest } from '../data/checkout.api';
import { CustomerErrandsApi } from '../data/errands.api';
import { PRICE_COPY, PriceChangeDialogComponent, PriceChangeDialogData } from './price-change-dialog.component';

export const RESUME_LIMIT = 20;

@Injectable()
export class CustomerPriceChangeWatcher {
  private readonly api = inject(CheckoutApi);
  private readonly errands = inject(CustomerErrandsApi);
  private readonly dialogs = inject(NmDialogService);
  private readonly realtime = inject(RealtimeService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private busy = false;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.realtime.priceChangeRequests$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => void this.live(e.errandId));
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') void this.resume();
    };
    this.document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => this.document.removeEventListener('visibilitychange', onVisible));
    void this.resume();
  }

  /** `price_change:requested` → the errand; if IN_PROGRESS, its pending request. */
  private async live(errandId: string): Promise<void> {
    await this.flight(async () => {
      const errand = await this.api.errand(errandId);
      if (errand.status !== 'IN_PROGRESS') return;
      const request = await this.firstPending(errandId);
      if (request) await this.open(errand, request);
    });
  }

  /** IN_PROGRESS errands (first 20), then each one's pending request; opens the first. */
  private async resume(): Promise<void> {
    await this.flight(async () => {
      const list = await this.errands.list(['IN_PROGRESS'], RESUME_LIMIT);
      for (const errand of list?.items ?? []) {
        if (errand.status !== 'IN_PROGRESS') continue;
        const request = await this.firstPending(errand.id);
        if (request) {
          await this.open(errand as CheckoutErrand, request);
          return;
        }
      }
    });
  }

  private async firstPending(errandId: string): Promise<PriceChangeRequest | null> {
    const pending = await this.api.pendingPriceChanges(errandId);
    const first = Array.isArray(pending) ? (pending[0] ?? null) : null;
    return first && first.status === 'requested' ? first : null;
  }

  private async open(errand: CheckoutErrand, request: PriceChangeRequest): Promise<void> {
    const data: PriceChangeDialogData = { errandId: errand.id, errand, request };
    const ref = this.dialogs.open(PriceChangeDialogComponent, { title: PRICE_COPY.title, dismissible: false, data });
    await ref.closed;
  }

  /** Single flight: a check while one runs or while the dialog is open is skipped; failures are silent. */
  private async flight(run: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await run();
    } catch {
      // Silent (Track also shows the request).
    } finally {
      this.busy = false;
    }
  }
}
