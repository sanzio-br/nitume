// customer-v-new-review.md, Required tests NR T1–T17 (G7-32). NR T16 (the
// receipt parts) runs in shared/ui/receipt/receipt.spec.ts.
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppHarness, text } from '../../../../testing/app-harness';
import { API, expectRequest, httpMock } from '../../../../testing/auth';
import { clearOverlays, dialogButton, draftOf, openCustomer } from '../../../../testing/customer';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { QUOTE_ESTIMATE, QUOTE_PREVIEW_ENABLED, QuoteEstimateResult } from '../data/quote-estimate';
import { NewCategoryPage } from './new-category.page';
import { REVIEW_COPY } from './new-review.page';
import { DraftPlace, WizardCategory } from './task-draft.store';

const P1: DraftPlace = { addressText: 'Nyali, Mombasa', lat: -4.04, lng: 39.7, placeId: 'p-nyali' };
const P2: DraftPlace = { addressText: 'Kilimani, Nairobi', lat: -1.29, lng: 36.78, placeId: null };

interface ReviewOptions {
  providers?: Provider[];
  budget?: number | null;
  opener?: string;
}

/** Step 1 (from `opener`) → a valid draft → step 3. */
async function openReview(category: WizardCategory, opts: ReviewOptions = {}) {
  const h = await openCustomer(opts.opener ?? '/app/customer/home', { providers: opts.providers });
  await h.harness.navigateByUrl(`/app/customer/new?category=${category}`);
  const store = draftOf(h, NewCategoryPage);
  store.description.set('Please check the apartment');
  store.first.set(P1);
  if (store.twoPoints()) store.dropoff.set(P2);
  if (store.isBuy()) store.items.set([{ name: 'Milk', quantity: 2 }]);
  if (store.hasBudget()) store.budget.set(opts.budget === undefined ? 40000 : opts.budget);
  store.detailsValidated = true;
  await h.harness.navigateByUrl('/app/customer/new/review');
  await h.detect();
  return { h, store };
}

const submitButton = (h: AppHarness) =>
  Array.from(h.root().querySelectorAll<HTMLButtonElement>('nm-fixed-cta button')).find((b) => text(b) === 'Submit task →') as HTMLButtonElement;
const backButton = (h: AppHarness) => h.root().querySelector('button[aria-label="Back"]') as HTMLButtonElement;
const reviewText = (h: AppHarness) => text(h.root().querySelector('app-new-review-page'));

async function clickSubmit(h: AppHarness) {
  submitButton(h).click();
  await h.detect();
}

const ERRAND = (id: string, status: string) => ({ errand: { id, status }, history: [] });
const toastMessage = () => TestBed.inject(NmToastService).current()?.message ?? null;

function previewProviders(estimate: (body: unknown) => Promise<QuoteEstimateResult | null>) {
  const fn = vi.fn(estimate);
  return {
    fn,
    providers: [
      { provide: QUOTE_PREVIEW_ENABLED, useValue: true },
      { provide: QUOTE_ESTIMATE, useValue: { estimate: fn } },
    ] as Provider[],
  };
}

describe('customer v-new-review (#7)', () => {
  afterEach(() => {
    clearOverlays();
    vi.restoreAllMocks();
  });

  it('NR T1. Review h1, Step 3 of 3 in nmNum, all three stepper segments done', async () => {
    const { h } = await openReview('inspection');
    expect(text(h.root().querySelector('nm-pushed-header h1'))).toBe('Review');
    expect(text(h.root().querySelector('nm-pushed-header [nmNum]'))).toBe('Step 3 of 3');
    const segments = Array.from(h.root().querySelectorAll('.nm-stepper__segment'));
    expect(segments.every((s) => s.classList.contains('nm-stepper__segment--done'))).toBe(true);
    expect(segments).toHaveLength(3);
    expect(document.title).toBe('Review · Nitume');
  });

  it('NR T2. variant A: the notice exactly; QUOTE_ESTIMATE never called; no Estimated price and no unavailable copy', async () => {
    const estimate = vi.fn(async () => null);
    const { h } = await openReview('inspection', { providers: [{ provide: QUOTE_ESTIMATE, useValue: { estimate } }] });
    expect(text(h.root().querySelector('.review__notice'))).toBe(REVIEW_COPY.notice);
    expect(estimate).not.toHaveBeenCalled();
    expect(reviewText(h)).not.toContain('Estimated price');
    expect(reviewText(h)).not.toContain(REVIEW_COPY.unavailable);
  });

  it('NR T3. variant A item budget: Buy For Me 40000 → card and row Item budget / KSh 40,000 in nmNum and the caption; budget 0 or Check It For Me → no card', async () => {
    let { h } = await openReview('buy_for_me', { budget: 40000 });
    const card = h.root().querySelector('nm-form-card.review__card') as HTMLElement;
    expect(text(card.querySelector('.nm-form-card__label'))).toBe('Item budget');
    expect(text(card.querySelector('.nm-receipt-row__label'))).toBe('Item budget');
    const amount = card.querySelector('.nm-receipt-row [nmNum]') as HTMLElement;
    expect(text(amount)).toBe('KSh 40,000');
    expect(amount.getAttribute('aria-label')).toBe('40,000 shillings');
    expect(text(card.querySelector('nm-receipt-caption'))).toBe(REVIEW_COPY.itemCaption);
    ({ h } = await openReview('pickup_delivery', { budget: 0 }));
    expect(h.root().querySelector('nm-form-card.review__card')).toBeNull();
    ({ h } = await openReview('inspection'));
    expect(h.root().querySelector('nm-form-card.review__card')).toBeNull();
  });

  it('NR T4. variant B: called once with the body; skeletons while pending (CTA enabled); a total renders with the caption; null or rejected → unavailable; the budget is a separate group, never added', async () => {
    let release: (v: QuoteEstimateResult | null) => void = () => undefined;
    let preview = previewProviders(() => new Promise((r) => (release = r)));
    let { h, store } = await openReview('buy_for_me', { providers: preview.providers, budget: 40000 });
    expect(preview.fn).toHaveBeenCalledTimes(1);
    expect(preview.fn.mock.calls[0][0]).toEqual(expect.objectContaining({ category: 'buy_for_me', budget: 40000 }));
    expect(h.root().querySelectorAll('.review__estimate nm-skeleton-card')).toHaveLength(2);
    expect(submitButton(h).disabled).toBe(false);
    release({ total: '2200.00', itemAmount: null });
    await h.detect();
    const total = h.root().querySelector('.review__estimate .nm-receipt-row--total') as HTMLElement;
    expect(text(total.querySelector('.nm-receipt-row__label'))).toBe('Estimated total (service + runner fee)');
    expect(text(total.querySelector('[nmNum]'))).toBe('KSh 2,200');
    expect(text(h.root().querySelector('.review__estimate nm-receipt-caption'))).toBe(REVIEW_COPY.estimateCaption);
    const group = h.root().querySelector('.review__estimate nm-receipt-group') as HTMLElement;
    expect(text(group.querySelector('[nmNum]'))).toBe('KSh 40,000');
    expect(reviewText(h)).not.toContain('KSh 42,200');
    expect(store.budget()).toBe(40000);

    preview = previewProviders(async () => null);
    ({ h } = await openReview('inspection', { providers: preview.providers }));
    await h.detect();
    expect(text(h.root().querySelector('.review__unavailable'))).toBe(REVIEW_COPY.unavailable);

    preview = previewProviders(async () => {
      throw new Error('down');
    });
    ({ h } = await openReview('inspection', { providers: preview.providers }));
    await h.detect();
    expect(text(h.root().querySelector('.review__unavailable'))).toBe(REVIEW_COPY.unavailable);
  });

  it('NR T5. the default QUOTE_ESTIMATE returns null and makes no HTTP request', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    await expect(TestBed.inject(QUOTE_ESTIMATE).estimate({} as never)).resolves.toBeNull();
    TestBed.inject(HttpTestingController).verify();
    expect(TestBed.inject(QUOTE_PREVIEW_ENABLED)).toBe(false);
  });

  it('NR T6. success: POST /errands with the body, then submit; replaceUrl to /tasks/:id/quote; finish(); Back into the wizard → openerUrl; no leave prompt', async () => {
    const { h, store } = await openReview('inspection', { opener: '/app/customer/history' });
    const expected = store.toRequest(new Date());
    await clickSubmit(h);
    const create = await expectRequest({ method: 'POST', url: `${API}/errands` });
    expect({ ...create.request.body, deadlineAt: undefined }).toEqual({ ...expected, deadlineAt: undefined });
    create.flush(ERRAND('e-1', 'DRAFT'));
    const submit = await expectRequest({ method: 'POST', url: `${API}/errands/e-1/submit` });
    submit.flush(ERRAND('e-1', 'REQUESTED'));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/tasks/e-1/quote'));
    expect(h.router.lastSuccessfulNavigation()?.extras.replaceUrl).toBe(true);
    expect(store.submitted).toBe(true);
    expect(store.hasData()).toBe(false);
    expect(store.openerUrl).toBe('/app/customer/history');
    expect(document.body.querySelector('nm-dialog')).toBeNull();
    await h.harness.navigateByUrl('/app/customer/new/details');
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/history'));
  });

  it('NR T7. submitting: spinner and aria-busy; a second click sends nothing; Back disabled and inert; a side-nav navigation is blocked without a dialog', async () => {
    const { h, store } = await openReview('inspection');
    await clickSubmit(h);
    const create = await expectRequest({ method: 'POST', url: `${API}/errands` });
    await h.detect();
    expect(store.submitting()).toBe(true);
    expect(submitButton(h).getAttribute('aria-busy')).toBe('true');
    expect(submitButton(h).querySelector('.nm-btn__spinner')).not.toBeNull();
    expect(text(submitButton(h))).toBe('Submit task →');
    await clickSubmit(h);
    expect(httpMock().match({ method: 'POST', url: `${API}/errands` })).toHaveLength(0);
    expect(backButton(h).disabled).toBe(true);
    expect(backButton(h).getAttribute('aria-disabled')).toBe('true');
    backButton(h).dispatchEvent(new MouseEvent('click'));
    await h.detect();
    expect(h.router.url).toBe('/app/customer/new/review');
    expect(await h.router.navigateByUrl('/app/customer/history')).toBe(false);
    expect(document.body.querySelector('nm-dialog')).toBeNull();
    create.flush(ERRAND('e-1', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-1/submit` })).flush(ERRAND('e-1', 'REQUESTED'));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/tasks/e-1/quote'));
  });

  it('NR T8. network error on create → the toast with the CTA-bar offset below 768px; CTA enabled again; still on step 3', async () => {
    const { h } = await openReview('inspection');
    const bar = h.root().querySelector('.nm-fixed-cta__bar') as HTMLElement;
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 64 } as DOMRect);
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).error(new ProgressEvent('error'), { status: 0 });
    await vi.waitFor(() => expect(toastMessage()).toBe("Couldn't send your task. Try again."));
    expect(TestBed.inject(NmToastService).current()?.offset).toBe(64);
    await h.detect();
    expect(submitButton(h).disabled).toBe(false);
    expect(submitButton(h).hasAttribute('aria-busy')).toBe(false);
    expect(h.router.url).toBe('/app/customer/new/review');
  });

  it('NR T9. create OK, submit 500 → generic toast; the retry calls only submit with the same id (create once in total)', async () => {
    const { h, store } = await openReview('inspection');
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(ERRAND('e-7', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-7/submit` })).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await vi.waitFor(() => expect(toastMessage()).toBe("Couldn't send your task. Try again."));
    expect(store.createdErrandId).toBe('e-7');
    await h.detect();
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-7/submit` })).flush(ERRAND('e-7', 'REQUESTED'));
    expect(httpMock().match({ method: 'POST', url: `${API}/errands` })).toHaveLength(0);
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/tasks/e-7/quote'));
  });

  it('NR T10. 400 on create → the API message as the toast and back on step 2; an array message → its first entry; none → the generic message', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ statusCode: 400, code: 'deadline_in_past', message: 'The deadline must be in the future' }, 'The deadline must be in the future'],
      [
        { statusCode: 400, message: ['description must be longer than or equal to 5 characters', 'other'] },
        'description must be longer than or equal to 5 characters',
      ],
      [{ statusCode: 400, code: 'budget_required' }, 'Something went wrong. Please try again.'],
    ];
    for (const [body, message] of cases) {
      const { h } = await openReview('inspection');
      await clickSubmit(h);
      (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(body, { status: 400, statusText: 'Bad Request' });
      await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/new/details'));
      expect(toastMessage()).toBe(message);
    }
  });

  it('NR T11. 400 on submit after a DRAFT → the generic toast; stays on step 3', async () => {
    const { h } = await openReview('inspection');
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(ERRAND('e-2', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-2/submit` })).flush(
      { statusCode: 400, message: 'Not a draft' },
      { status: 400, statusText: 'Bad Request' },
    );
    await vi.waitFor(() => expect(toastMessage()).toBe("Couldn't send your task. Try again."));
    expect(h.router.url).toBe('/app/customer/new/review');
  });

  it('NR T12. 422 location_outside_service_area on create → no toast; the notice and Change location; CTA disabled; nothing to cancel', async () => {
    const { h, store } = await openReview('inspection');
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(
      { statusCode: 422, code: 'location_outside_service_area', message: 'Outside', pointType: 'task_site' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await vi.waitFor(async () => {
      await h.detect();
      expect(store.locationRefused()).toBe(true);
    });
    await h.detect();
    expect(toastMessage()).toBeNull();
    const above = h.root().querySelector('nm-fixed-cta .nm-fixed-cta__above') as HTMLElement;
    expect(text(above.querySelector('[role="alert"]'))).toBe(REVIEW_COPY.outsideArea);
    expect(text(above.querySelector('.review__change button'))).toBe('Change location');
    expect(above.querySelector('.review__change button')?.className).toContain('nm-btn--outline');
    expect(submitButton(h).disabled).toBe(true);
    expect(httpMock().match((r) => r.method === 'PATCH')).toHaveLength(0);
    await vi.waitFor(() => expect(document.activeElement).toBe(above.querySelector('.review__change button')));
  });

  it('NR T13. 422 on submit after a DRAFT → PATCH CANCELLED and createdErrandId cleared; after a re-pick the CTA enables and POST /errands runs again', async () => {
    const { h, store } = await openReview('pickup_delivery');
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(ERRAND('e-3', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-3/submit` })).flush(
      { statusCode: 422, code: 'location_outside_service_area', message: 'Outside', pointType: 'dropoff' },
      { status: 422, statusText: 'Unprocessable' },
    );
    const cancel = await expectRequest({ method: 'PATCH', url: `${API}/errands/e-3/status` });
    expect(cancel.request.body).toEqual({ to: 'CANCELLED' });
    cancel.flush(ERRAND('e-3', 'CANCELLED'));
    await h.detect();
    expect(store.createdErrandId).toBeNull();
    expect(submitButton(h).disabled).toBe(true);
    store.dropoff.set({ ...P2 }); // a new pick on step 2
    await h.detect();
    expect(submitButton(h).disabled).toBe(false);
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(ERRAND('e-4', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-4/submit` })).flush(ERRAND('e-4', 'REQUESTED'));
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/tasks/e-4/quote'));
  });

  it('NR T14. Change location: dropoff on Get It For Me → step 2 focusing Deliver to; task_site → the first field', async () => {
    const refuse = async (category: WizardCategory, pointType: string) => {
      const { h, store } = await openReview(category);
      await clickSubmit(h);
      (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(
        { statusCode: 422, code: 'location_outside_service_area', message: 'Outside', pointType },
        { status: 422, statusText: 'Unprocessable' },
      );
      await vi.waitFor(async () => {
        await h.detect();
        expect(store.locationRefused()).toBe(true);
      });
      const change = h.root().querySelector('.review__change button') as HTMLButtonElement;
      change.click();
      await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/new/details'));
      await h.detect();
      return h;
    };
    let h = await refuse('pickup_delivery', 'dropoff');
    expect(document.activeElement).toBe(h.root().querySelector('[data-field="dropoff"] input'));
    h = await refuse('inspection', 'task_site');
    expect(document.activeElement).toBe(h.root().querySelector('[data-field="first"] input'));
  });

  it('NR T15. leaving the wizard after a failed submit with a DRAFT cancels it (NC§W8)', async () => {
    const { h } = await openReview('inspection');
    await clickSubmit(h);
    (await expectRequest({ method: 'POST', url: `${API}/errands` })).flush(ERRAND('e-5', 'DRAFT'));
    (await expectRequest({ method: 'POST', url: `${API}/errands/e-5/submit` })).error(new ProgressEvent('error'), { status: 0 });
    await vi.waitFor(() => expect(toastMessage()).toBe("Couldn't send your task. Try again."));
    const leaving = h.router.navigateByUrl('/app/customer/history');
    await vi.waitFor(() => expect(document.body.querySelector('nm-dialog')).not.toBeNull());
    dialogButton('Discard').click();
    expect(await leaving).toBe(true);
    const cancel = await expectRequest({ method: 'PATCH', url: `${API}/errands/e-5/status` });
    expect(cancel.request.body).toEqual({ to: 'CANCELLED' });
    cancel.flush(ERRAND('e-5', 'CANCELLED'));
  });

  it('NR T17. no wallet, escrow, balance, hold, release or KES; no mockup fee lines or route options (both variants)', async () => {
    const forbidden = /wallet|escrow|balance|\bhold\b|release|\bKES\b|Base fee|Transport|Report & evidence|How should this be paid|advance/i;
    let { h } = await openReview('buy_for_me', { budget: 40000 });
    expect(reviewText(h)).not.toMatch(forbidden);
    const preview = previewProviders(async () => ({ total: '2200.00', itemAmount: null }));
    ({ h } = await openReview('buy_for_me', { providers: preview.providers, budget: 40000 }));
    await h.detect();
    expect(reviewText(h)).toContain('KSh 2,200');
    expect(reviewText(h)).not.toMatch(forbidden);
  });
});
