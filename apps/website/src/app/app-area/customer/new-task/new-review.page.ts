// customer `v-new-review` (customer-v-new-review.md): wizard step 3.
// Variant A (preview off, the MVP default): a notice and, with a budget,
// the item-budget card; no estimate request. Variant B (owner go-ahead on
// pricing rates): the QUOTE_ESTIMATE total. `Submit task →` creates the
// DRAFT, then submits it; a retry only submits. A service-area refusal
// (422) shows the notice and `Change location` above the CTA. Nothing is
// paid here; the item budget is never added to a fee total.
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { kesSpoken } from '../../../shared/format/formatters';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmFormCard } from '../../../shared/ui/field/form-card.component';
import { NmFixedCtaOffset } from '../../../shared/ui/fixed-cta/fixed-cta.component';
import { NmNotice } from '../../../shared/ui/notice/notice.component';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { NmReceiptCaption, NmReceiptGroup, NmReceiptRow } from '../../../shared/ui/receipt/receipt.component';
import { NmSkeletonCard } from '../../../shared/ui/states/skeleton-card.component';
import { NmWizardFrame } from '../../../shared/ui/wizard-frame/wizard-frame.component';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/ui/states/friendly-error';
import { customerLinks } from '../customer-links';
import { ApiError, CustomerErrandsApi, PointType, apiErrorOf } from '../data/errands.api';
import { QUOTE_ESTIMATE, QUOTE_PREVIEW_ENABLED, QuoteEstimateResult } from '../data/quote-estimate';
import { TaskDraftStore } from './task-draft.store';

export const REVIEW_COPY = {
  notice: "We'll send your final quote after you submit. You won't pay anything until you accept it.",
  itemBudget: 'Item budget',
  itemCaption: 'Paid separately from the fees. You choose how after your quote is ready.',
  estimateHeading: 'Estimated price',
  estimateTotal: 'Estimated total (service + runner fee)',
  estimateCaption: "This is an estimate. We'll send your final quote after you submit, and you won't pay anything until you accept it.",
  unavailable: "We couldn't estimate the price right now. You can still submit; we'll send you the final quote.",
  submitFailed: "Couldn't send your task. Try again.",
  outsideArea: "We don't cover this location yet. Choose a place inside the areas we serve.",
  changeLocation: 'Change location',
} as const;

const OUTSIDE_AREA = 'location_outside_service_area';
const POINT_TYPES: readonly PointType[] = ['task_site', 'pickup', 'dropoff'];

type EstimateState = { kind: 'loading' } | { kind: 'ready'; result: QuoteEstimateResult } | { kind: 'unavailable' };

@Component({
  selector: 'app-new-review-page',
  imports: [NmWizardFrame, NmNotice, NmFormCard, NmReceiptRow, NmReceiptCaption, NmReceiptGroup, NmSkeletonCard, NmButton],
  templateUrl: './new-review.page.html',
  styleUrl: './new-review.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewReviewPage {
  protected readonly store = inject(TaskDraftStore);
  private readonly api = inject(CustomerErrandsApi);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(NmToastService);
  private readonly ctaOffset = inject(NmFixedCtaOffset);
  private readonly estimator = inject(QUOTE_ESTIMATE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly copy = REVIEW_COPY;
  protected readonly preview = inject(QUOTE_PREVIEW_ENABLED);
  protected readonly detailsUrl = customerLinks.newTaskDetails();
  protected readonly unloadGuard = () => this.store.hasData() && !this.store.submitted;

  protected readonly estimate = signal<EstimateState>({ kind: 'loading' });
  protected readonly estimateResult = computed(() => {
    const e = this.estimate();
    return e.kind === 'ready' ? e.result : null;
  });
  /** The item budget (Buy / Get only), shown when > 0. */
  protected readonly itemBudget = computed(() => {
    const b = this.store.hasBudget() ? (this.store.budget() ?? 0) : 0;
    return b > 0 ? b : null;
  });
  protected readonly itemSpoken = computed(() => {
    const b = this.itemBudget();
    return b === null ? null : kesSpoken(b);
  });

  constructor() {
    if (this.preview) void this.loadEstimate();
  }

  protected spoken(amount: string): string {
    return kesSpoken(amount);
  }

  protected async submit(): Promise<void> {
    const store = this.store;
    if (store.submitting() || store.locationRefused()) return;
    store.submitting.set(true);
    try {
      let id = store.createdErrandId;
      if (!id) {
        try {
          id = (await this.api.create(store.toRequest(new Date()))).errand.id;
          store.createdErrandId = id;
        } catch (err) {
          this.onCreateError(apiErrorOf(err));
          return;
        }
      }
      try {
        await this.api.submit(id);
      } catch (err) {
        this.onSubmitError(apiErrorOf(err), id);
        return;
      }
      store.submitted = true;
      store.submitting.set(false);
      if (await this.router.navigateByUrl(customerLinks.awaitingQuote(id), { replaceUrl: true })) store.finish();
    } finally {
      store.submitting.set(false);
    }
  }

  protected changeLocation(): void {
    const refused = this.store.outsideArea();
    this.store.focusOnReturn = refused?.pointType === 'dropoff' && this.store.twoPoints() ? 'dropoff' : 'first';
    this.backToDetails();
  }

  private async loadEstimate(): Promise<void> {
    try {
      const result = await this.estimator.estimate(this.store.toRequest(new Date()));
      this.estimate.set(result ? { kind: 'ready', result } : { kind: 'unavailable' });
    } catch {
      this.estimate.set({ kind: 'unavailable' });
    }
  }

  private onCreateError(err: ApiError): void {
    if (this.handledElsewhere(err)) return;
    if (err.status === 422 && err.code === OUTSIDE_AREA) {
      this.refuse(err.pointType);
      return;
    }
    if (err.status === 400) {
      this.showToast(err.message ?? GENERIC_ERROR_MESSAGE);
      this.backToDetails();
      return;
    }
    this.showToast(REVIEW_COPY.submitFailed);
  }

  private onSubmitError(err: ApiError, id: string): void {
    if (this.handledElsewhere(err)) return;
    if (err.status === 422 && err.code === OUTSIDE_AREA) {
      // The DRAFT holds the refused location and cannot be edited.
      void this.api.cancelDraft(id).catch(() => undefined);
      this.store.createdErrandId = null;
      this.refuse(err.pointType);
      return;
    }
    this.showToast(REVIEW_COPY.submitFailed);
  }

  /** 401 / `account_suspended`: the #6 interceptor signs out with its own toast. */
  private handledElsewhere(err: ApiError): boolean {
    return err.status === 401 || err.code === 'account_suspended';
  }

  private refuse(pointType: string | undefined): void {
    const type = (POINT_TYPES as readonly string[]).includes(pointType ?? '') ? (pointType as PointType) : null;
    this.store.outsideArea.set({ first: this.store.first(), dropoff: this.store.dropoff(), pointType: type });
    setTimeout(() => this.host.querySelector<HTMLElement>('.review__change button')?.focus());
  }

  private showToast(message: string): void {
    this.toast.show(message, { offset: this.ctaOffset.toastOffset() });
  }

  /** History back when step 2 is the previous page (the app's pop), else a navigation. */
  private backToDetails(): void {
    const previous = this.router.lastSuccessfulNavigation()?.previousNavigation?.finalUrl;
    if (previous && this.router.serializeUrl(previous) === this.detailsUrl) this.location.back();
    else void this.router.navigateByUrl(this.detailsUrl);
  }
}

