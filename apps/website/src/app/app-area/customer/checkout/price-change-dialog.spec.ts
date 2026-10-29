// customer-v-price-auth.md, Required tests PA T1–T15 (gap report G8-29,
// G8-30; owner WQ-27 in T14).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Route } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AppHarness, openApp, text } from '../../../../testing/app-harness';
import { API, expectRequest, httpMock } from '../../../../testing/auth';
import {
  FakeRealtime,
  checkoutErrand,
  checkoutRig,
  differenceJson,
  flushGet,
  openCheckout,
  priceChangeJson,
  requests,
} from '../../../../testing/checkout';
import { clearOverlays } from '../../../../testing/customer';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { NmOverlayRef } from '../../../shared/ui/overlay/overlay-ref';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { CUSTOMER_ROUTES } from '../../customer.routes';
import { RUNNER_ROUTES } from '../../runner.routes';
import { CheckoutErrand, PriceChangeDecision } from '../data/checkout.api';
import { PRICE_COPY, PriceChangeDialogComponent, PriceChangeDialogData } from './price-change-dialog.component';
import { CustomerPriceChangeWatcher } from './price-change.watcher';

const LIST = '/errands?status=IN_PROGRESS&limit=20';
const RUNNING = (over: Partial<CheckoutErrand> = {}) =>
  checkoutErrand({ status: 'IN_PROGRESS', assignment: { runner: { shortName: 'Brian K.' } }, ...over });

const dialogs = () => Array.from(document.querySelectorAll('nm-dialog'));
const dialog = () => document.querySelector('nm-dialog app-price-change-dialog')?.closest('nm-dialog') as HTMLElement | null;
const inDialog = (selector: string) => dialog()?.querySelector(selector) as HTMLElement | null;
const action = (selector: string) => inDialog(`${selector} button`) as HTMLButtonElement;
const toast = () => TestBed.inject(NmToastService).current()?.message ?? null;

function decision(over: Partial<PriceChangeDecision> = {}): PriceChangeDecision {
  return { ...priceChangeJson({ status: 'approved' }), differencePayment: null, refundReview: null, ...over };
}

/** A signed-in customer page with the watcher's start-up check answered (no IN_PROGRESS errand). */
async function shell(realtime = new FakeRealtime()) {
  const rig = checkoutRig({ realtime });
  const h = await openCheckout('/app/customer/history', rig);
  await flushGet(LIST, { items: [], nextCursor: null });
  await h.detect();
  return { h, rig };
}

async function openDialog(data: Partial<PriceChangeDialogData> = {}, realtime?: FakeRealtime) {
  const { h, rig } = await shell(realtime);
  const ref = TestBed.inject(NmDialogService).open(PriceChangeDialogComponent, {
    title: PRICE_COPY.title,
    dismissible: false,
    data: { errandId: 'e-1', errand: RUNNING(), request: priceChangeJson(), ...data },
  }) as NmOverlayRef<unknown>;
  await h.detect();
  return { h, rig, ref };
}

async function flushPost(path: string, body: unknown, status = 200) {
  const req = await expectRequest(`${API}${path}`);
  if (status === 0) req.error(new ProgressEvent('error'), { status: 0 });
  else if (status >= 400) req.flush(body as object, { status, statusText: 'Error' });
  else req.flush(body as object);
  return req;
}

const error409 = (code: string) => ({ statusCode: 409, code, message: 'x' });

describe('customer v-price-auth (#8)', () => {
  afterEach(() => {
    clearOverlays();
    TestBed.inject(NmToastService).dismiss();
    vi.restoreAllMocks();
  });

  it('PA T1. increase copy exactly as the mockup with the runner short name; missing → Your runner; the reason in quotes', async () => {
    await openDialog({ request: priceChangeJson({ reason: 'The 5 kg bag is out of stock' }) });
    expect(text(dialog()?.querySelector('.nm-dialog__title'))).toBe('Price change');
    expect(text(inDialog('.pc__body'))).toBe('Brian K. found the item priced higher than quoted. Approve the difference to continue?');
    expect(text(inDialog('.pc__reason'))).toBe('"The 5 kg bag is out of stock"');
    clearOverlays();
    await openDialog({ errand: checkoutErrand({ status: 'IN_PROGRESS', assignment: null }) });
    expect(text(inDialog('.pc__body'))).toBe('Your runner found the item priced higher than quoted. Approve the difference to continue?');
    expect(inDialog('.pc__reason')).toBeNull();
  });

  it('PA T2. decrease copy, − KSh 5,000 less with U+2212, Approve new price', async () => {
    await openDialog({ request: priceChangeJson({ toPrice: '35000.00' }) });
    expect(text(inDialog('.pc__body'))).toBe('Brian K. found the item priced lower than quoted. Approve the new price to continue?');
    expect(text(inDialog('.pc__difference'))).toBe('− KSh 5,000 less');
    expect(text(action('.pc__approve'))).toBe('Approve new price');
  });

  it('PA T3. compare values in nmNum, blue Original, amber New price and difference; no currency prefix on the two values', async () => {
    await openDialog();
    const original = inDialog('.pc__value--original') as HTMLElement;
    const next = inDialog('.pc__value--new') as HTMLElement;
    expect([text(original), text(next)]).toEqual(['40,000', '45,000']);
    expect(original.hasAttribute('nmNum') && next.hasAttribute('nmNum')).toBe(true);
    expect(getComputedStyle(original).color).toBe('var(--nitume-blue)');
    expect(getComputedStyle(next).color).toBe('var(--nitume-amber)');
    const diff = inDialog('.pc__difference') as HTMLElement;
    expect(diff.hasAttribute('nmNum')).toBe(true);
    expect(getComputedStyle(diff).color).toBe('var(--nitume-amber)');
    expect(Array.from(dialog()?.querySelectorAll('.pc__col') ?? []).map((c) => c.getAttribute('aria-label'))).toEqual([
      'Original KSh 40,000',
      'New price KSh 45,000',
    ]);
    expect(text(inDialog('.pc__label'))).toBe('Original');
    expect(action('.pc__approve').querySelector('[nmNum]')?.textContent).toBe('KSh 5,000');
  });

  it('PA T4. not dismissible: scrim click and Escape keep it open; a navigation behind it does not close it', async () => {
    const { h } = await openDialog();
    (dialog()?.querySelector('.nm-overlay__scrim') as HTMLElement).click();
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await h.detect();
    expect(dialog()).not.toBeNull();
    await h.router.navigateByUrl('/app/customer/profile');
    await h.detect();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('PA T5. approve increase (send_to_runner): POST approve without a route; a decision with differencePayment.merchantPayment → toast and …/item-payment with approvedIncrease and priceChangeRequestId', async () => {
    const { h, ref } = await openDialog();
    const nav = vi.spyOn(h.router, 'navigateByUrl');
    action('.pc__approve').click();
    const req = await flushPost('/errands/e-1/price-change/r-1/approve', decision({ differencePayment: differenceJson() }));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    await h.detect();
    expect(ref.isOpen).toBe(false);
    expect(toast()).toBe('Price change approved.');
    expect(nav).toHaveBeenCalledWith('/app/customer/tasks/e-1/item-payment', {
      state: { approvedIncrease: '5000.00', priceChangeRequestId: 'r-1' },
    });
  });

  it('PA T6. approve decrease: refundReview → the refund toast, no navigation; without → Price change approved., no navigation', async () => {
    for (const [refundReview, message] of [
      [{ status: 'pending' }, "Price change approved. We'll review a refund of the difference."],
      [null, 'Price change approved.'],
    ] as const) {
      const { h } = await openDialog({ request: priceChangeJson({ toPrice: '35000.00' }) });
      const nav = vi.spyOn(h.router, 'navigateByUrl');
      action('.pc__approve').click();
      await flushPost('/errands/e-1/price-change/r-1/approve', decision({ refundReview }));
      await h.detect();
      expect.soft(toast()).toBe(message);
      expect.soft(nav).not.toHaveBeenCalled();
      clearOverlays();
    }
  });

  it('PA T7. route required: merchant_route_required (and merchant_details_missing) → route rows, nothing preselected, approve disabled; Send purchase amount to runner → approve sends it; merchant-direct disabled without details', async () => {
    for (const [code, status] of [
      ['merchant_route_required', 400],
      ['merchant_details_missing', 409],
    ] as const) {
      const { h } = await openDialog({ errand: RUNNING({ merchantDetailsAvailable: false }) });
      action('.pc__approve').click();
      await flushPost('/errands/e-1/price-change/r-1/approve', { statusCode: status, code, message: 'x' }, status);
      await h.detect();
      expect.soft(text(inDialog('.pc__route-label')), code).toBe('How should this be paid?');
      const radios = Array.from(dialog()?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? []);
      expect.soft(radios.map((r) => r.value), code).toEqual(['merchant_direct', 'send_to_runner']);
      expect.soft(radios.some((r) => r.checked), code).toBe(false);
      expect.soft(radios[0].getAttribute('aria-disabled'), code).toBe('true');
      expect.soft(action('.pc__approve').disabled, code).toBe(true);
      radios[1].click();
      await h.detect();
      expect.soft(action('.pc__approve').disabled, code).toBe(false);
      action('.pc__approve').click();
      const req = await flushPost('/errands/e-1/price-change/r-1/approve', decision());
      expect.soft(req.request.body, code).toEqual({ merchantRoute: 'send_to_runner' });
      clearOverlays();
    }
  });

  it('PA T8. reject: the confirm with exact copy stacked above; Go back → no request, focus back on Reject; confirm → POST reject, both dialogs close', async () => {
    const { h, ref } = await openDialog();
    action('.pc__reject').focus();
    action('.pc__reject').click();
    await h.detect();
    expect(dialogs()).toHaveLength(2);
    const confirm = dialogs()[1];
    expect(text(confirm.querySelector('.nm-dialog__title'))).toBe('Reject and cancel this task?');
    expect(text(confirm.querySelector('.nm-dialog__body'))).toBe(
      "The runner will stop work on this task. We'll review a refund of what you've paid, and you can follow it on the task.",
    );
    const buttons = Array.from(confirm.querySelectorAll<HTMLButtonElement>('.nm-dialog__actions button'));
    expect(buttons.map((b) => text(b))).toEqual(['Reject & cancel', 'Go back']);
    expect(buttons[0].className).toContain('nm-btn--destructive');
    expect(buttons[1].className).toContain('nm-btn--primary');
    buttons[1].click();
    await h.detect();
    expect(dialogs()).toHaveLength(1);
    expect(requests('/errands/e-1/price-change/r-1/reject')).toHaveLength(0);
    expect(document.activeElement).toBe(action('.pc__reject'));

    action('.pc__reject').click();
    await h.detect();
    (dialogs()[1].querySelector('.nm-dialog__actions button') as HTMLButtonElement).click();
    const req = await flushPost('/errands/e-1/price-change/r-1/reject', decision({ status: 'rejected', refundReview: { status: 'pending' } }));
    expect(req.request.method).toBe('POST');
    await h.detect();
    expect(ref.isOpen).toBe(false);
    expect(dialogs()).toHaveLength(0);
  });

  it('PA T9. already answered for price_change_already_decided, price_change_not_in_progress, a non-IN_PROGRESS errand and an empty pending list; OK closes', async () => {
    const expectAnswered = async (ref: NmOverlayRef<unknown>, h: AppHarness) => {
      await h.detect();
      expect(text(inDialog('.pc__body'))).toBe('This price change was already answered.');
      expect(Array.from(dialog()?.querySelectorAll('.pc__actions button') ?? []).map((b) => text(b))).toEqual(['OK']);
      action('.pc__ok').click();
      expect(ref.isOpen).toBe(false);
    };
    for (const code of ['price_change_already_decided', 'price_change_not_in_progress']) {
      const { h, ref } = await openDialog();
      action('.pc__approve').click();
      await flushPost('/errands/e-1/price-change/r-1/approve', error409(code), 409);
      await expectAnswered(ref, h);
    }
    let opened = await openDialog({ errand: RUNNING({ status: 'AWAITING_CUSTOMER' }) });
    await expectAnswered(opened.ref, opened.h);
    opened = await openDialog({ request: null });
    await flushGet('/errands/e-1/price-change?status=requested', []);
    await expectAnswered(opened.ref, opened.h);
  });

  it('PA T10. price_change_reject_not_cancellable and a network error → the inline error; actions enabled again', async () => {
    let { h } = await openDialog();
    action('.pc__reject').click();
    await h.detect();
    (dialogs()[1].querySelector('.nm-dialog__actions button') as HTMLButtonElement).click();
    await flushPost('/errands/e-1/price-change/r-1/reject', error409('price_change_reject_not_cancellable'), 409);
    await h.detect();
    expect(text(dialog()?.querySelector('.nm-dialog__error[role="alert"]'))).toBe("Couldn't send your answer. Try again.");
    expect(action('.pc__approve').disabled).toBe(false);
    expect(action('.pc__reject').disabled).toBe(false);
    clearOverlays();
    ({ h } = await openDialog());
    action('.pc__approve').click();
    await flushPost('/errands/e-1/price-change/r-1/approve', null, 0);
    await h.detect();
    expect(text(dialog()?.querySelector('.nm-dialog__error'))).toBe(PRICE_COPY.sendFailed);
    expect(action('.pc__approve').disabled).toBe(false);
  });

  it('PA T11. load failure → copy, Try again reloads, Close closes', async () => {
    const { h, ref } = await openDialog({ request: null });
    await flushGet('/errands/e-1/price-change?status=requested', null, 500);
    await h.detect();
    expect(text(inDialog('.pc__body'))).toBe("Couldn't load this price change.");
    expect(Array.from(dialog()?.querySelectorAll('.pc__actions button') ?? []).map((b) => text(b))).toEqual(['Try again', 'Close']);
    action('.pc__retry').click();
    await flushGet('/errands/e-1/price-change?status=requested', [priceChangeJson()]);
    await h.detect();
    expect(text(inDialog('.pc__difference'))).toBe('+ KSh 5,000 additional');
    clearOverlays();
    ref.close();
    const again = await openDialog({ request: null });
    await flushGet('/errands/e-1/price-change?status=requested', null, 0);
    await again.h.detect();
    action('.pc__close').click();
    expect(again.ref.isOpen).toBe(false);
    expect(ref.isOpen).toBe(false);
  });

  it('PA T12. watcher live: price_change:requested for an IN_PROGRESS errand opens one dialog; a second event while open opens nothing; a non-IN_PROGRESS errand opens nothing', async () => {
    const { h, rig } = await shell();
    const event = (errandId: string) =>
      rig.realtime.priceChangeRequests$.next({ errandId, requestId: 'r-1', fromPrice: '40000.00', toPrice: '45000.00', reason: null, createdAt: null });
    event('e-1');
    await flushGet('/errands/e-1', RUNNING());
    await flushGet('/errands/e-1/price-change?status=requested', [priceChangeJson()]);
    await h.detect();
    expect(dialogs()).toHaveLength(1);
    event('e-1');
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    expect(dialogs()).toHaveLength(1);
    // Answering closes it; the watcher is free again.
    action('.pc__approve').click();
    await flushPost('/errands/e-1/price-change/r-1/approve', decision());
    await h.detect();
    expect(dialogs()).toHaveLength(0);
    event('e-2');
    await flushGet('/errands/e-2', RUNNING({ id: 'e-2', status: 'AWAITING_CUSTOMER' }));
    await h.detect();
    expect(requests('/errands/e-2/price-change?status=requested')).toHaveLength(0);
    expect(dialogs()).toHaveLength(0);
  });

  it('PA T13. watcher resume: on shell start and on visibilitychange → visible it lists IN_PROGRESS errands and opens the first pending request; a listing failure is silent', async () => {
    const rig = checkoutRig();
    const h = await openCheckout('/app/customer/history', rig);
    await flushGet(LIST, { items: [RUNNING({ id: 'e-1' }), RUNNING({ id: 'e-2' })], nextCursor: null });
    await flushGet('/errands/e-1/price-change?status=requested', []);
    await flushGet('/errands/e-2/price-change?status=requested', [priceChangeJson({ errandId: 'e-2' })]);
    await h.detect();
    expect(dialogs()).toHaveLength(1);
    expect(text(inDialog('.pc__body'))).toContain('Brian K.');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await new Promise((r) => setTimeout(r));
    document.dispatchEvent(new Event('visibilitychange'));
    await h.detect();
    // Single flight: while the dialog is open, a visibility check lists nothing.
    expect(httpMock().match((r) => r.urlWithParams === `${API}${LIST}`)).toHaveLength(0);
    visibility.mockRestore();
    clearOverlays();

    const fresh = checkoutRig();
    const h2 = await openCheckout('/app/customer/history', fresh);
    await flushGet(LIST, null, 500);
    await h2.detect();
    expect(toast()).toBeNull();
    expect(dialogs()).toHaveLength(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushGet(LIST, { items: [], nextCursor: null });
    await h2.detect();
    expect(dialogs()).toHaveLength(0);
  });

  it('PA T14. WQ-27: item amounts only: no fee text or figure; the difference from subtractKes (45000 − 40000 → + KSh 5,000 additional; 40000.50 − 40000 → + KSh 0.50 additional)', async () => {
    await openDialog();
    expect(text(inDialog('.pc__difference'))).toBe('+ KSh 5,000 additional');
    expect(text(dialog())).not.toMatch(/fee|KSh 1,100|KSh 440|KSh 660|wallet|escrow/i);
    clearOverlays();
    await openDialog({ request: priceChangeJson({ toPrice: '40000.50' }) });
    expect(text(inDialog('.pc__difference'))).toBe('+ KSh 0.50 additional');
    expect(text(action('.pc__approve'))).toBe('Approve KSh 0.50 increase');
  });

  it('PA T15. watcher placement: provided only on the customer shell route; the runner routes and app.config.ts have none; a marketing page starts no watcher', async () => {
    const shellRoute = CUSTOMER_ROUTES.find((r) => r.path === '' && r.children) as Route;
    expect(shellRoute.providers?.[0]).toBe(CustomerPriceChangeWatcher);
    expect(shellRoute.providers).toHaveLength(2);
    const otherProviders = CUSTOMER_ROUTES.filter((r) => r !== shellRoute).flatMap((r) => r.providers ?? []);
    expect(otherProviders).not.toContain(CustomerPriceChangeWatcher);
    const runnerProviders = JSON.stringify(RUNNER_ROUTES, (_k, v) => (typeof v === 'function' ? v.name : v));
    expect(runnerProviders).not.toContain('CustomerPriceChangeWatcher');
    for (const file of ['src/app.config.ts', 'src/app/app-area/runner.routes.ts', 'src/app/app.routes.ts']) {
      expect.soft(readFileSync(resolve(process.cwd(), file), 'utf8'), file).not.toMatch(/PriceChangeWatcher/);
    }
    const h = await openApp('/', { restore: 'none' });
    await h.detect();
    expect(httpMock().match((r) => r.urlWithParams === `${API}${LIST}`)).toHaveLength(0);
  });
});
