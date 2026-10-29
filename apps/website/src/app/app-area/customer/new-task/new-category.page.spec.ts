// customer-v-new-category.md, Required tests NC T1–T10 (G7-30, G7-17).
import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppHarness, text } from '../../../../testing/app-harness';
import { declared, noShadow } from '../../../../testing/css';
import { clearOverlays, dialogActions, dialogButton, draftOf, openCustomer } from '../../../../testing/customer';
import { NmCategoryGrid } from '../../../shared/ui/category/category-grid.component';
import { NewCategoryPage } from './new-category.page';

const NAMES = ['Buy For Me', 'Get It For Me', 'Check It For Me', 'Go There For Me', 'Wait For Me'];

const radios = (h: AppHarness) => Array.from(h.root().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const cta = (h: AppHarness) =>
  Array.from(h.root().querySelectorAll<HTMLButtonElement>('nm-fixed-cta button')).find((b) => text(b) === 'Continue →') as HTMLButtonElement;

describe('customer v-new-category (#7)', () => {
  afterEach(() => {
    clearOverlays();
    vi.restoreAllMocks();
  });

  it('NC T1. New task h1, Step 1 of 3 in nmNum, the section label and exactly five tiles in canonical order; no Business Tasks; no sixth cell', async () => {
    const h = await openCustomer('/app/customer/new');
    expect(text(h.root().querySelector('nm-pushed-header h1'))).toBe('New task');
    const counter = h.root().querySelector('nm-pushed-header [nmNum]') as HTMLElement;
    expect(text(counter)).toBe('Step 1 of 3');
    expect(text(h.root().querySelector('nm-section-label h2'))).toBe('What do you need done?');
    expect(radios(h).map((r) => text(r))).toEqual(NAMES);
    expect(h.root().textContent).not.toContain('Business Tasks');
    expect(h.root().querySelector('.nm-category-grid')?.children).toHaveLength(5);
    expect(document.title).toBe('New task · Nitume');
  });

  it('NC T2. stepper: segment 1 done (green), segments 2–3 empty (slate-line)', async () => {
    const h = await openCustomer('/app/customer/new');
    const segments = Array.from(h.root().querySelectorAll('.nm-stepper__segment'));
    expect(segments.map((s) => (s.classList.contains('nm-stepper__segment--done') ? 'done' : 'empty'))).toEqual([
      'done',
      'empty',
      'empty',
    ]);
    expect(declared('.nm-stepper__segment--done', 'background-color')).toEqual(['var(--nitume-green)']);
    expect(declared('.nm-stepper__segment--empty', 'background-color')).toEqual(['var(--nitume-slate-line)']);
  });

  it('NC T3. nothing selected → Continue → disabled; selecting a tile enables it', async () => {
    const h = await openCustomer('/app/customer/new');
    expect(cta(h).disabled).toBe(true);
    radios(h)[1].click();
    await h.detect();
    expect(cta(h).disabled).toBe(false);
  });

  it('NC T4. ?category=inspection preselects Check It For Me; business and foo select nothing and drop the query with replaceUrl', async () => {
    let h = await openCustomer('/app/customer/new?category=inspection');
    expect(radios(h).filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => text(r))).toEqual(['Check It For Me']);
    expect(cta(h).disabled).toBe(false);
    for (const bad of ['business', 'foo']) {
      const replace = vi.spyOn(Location.prototype, 'replaceState');
      const go = vi.spyOn(Location.prototype, 'go');
      h = await openCustomer(`/app/customer/new?category=${bad}`);
      expect(h.router.url).toBe('/app/customer/new');
      expect(radios(h).some((r) => r.getAttribute('aria-checked') === 'true')).toBe(false);
      expect(replace.mock.calls.map((c) => c[0])).toContain('/app/customer/new');
      expect(go.mock.calls.map((c) => c[0])).not.toContain('/app/customer/new');
      replace.mockRestore();
      go.mockRestore();
    }
  });

  it('NC T5. radio semantics: radiogroup, one aria-checked, arrow keys move and select, Space selects', async () => {
    const h = await openCustomer('/app/customer/new?category=pickup_delivery');
    const group = h.root().querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-labelledby')).toBe('new-category-label');
    expect(radios(h).filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    radios(h)[1].focus();
    radios(h)[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await h.detect();
    expect(radios(h)[2].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radios(h)[2]);
    // Space on a focused radio button activates it (native click).
    radios(h)[4].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    radios(h)[4].click();
    await h.detect();
    expect(radios(h)[4].getAttribute('aria-checked')).toBe('true');
    expect(radios(h).map((r) => r.getAttribute('aria-posinset'))).toEqual(['1', '2', '3', '4', '5']);
    expect(radios(h).every((r) => r.getAttribute('aria-setsize') === '5')).toBe(true);
  });

  it('NC T6. selected tile: green border + inset ring classes and no shadow; unselected slate-line', async () => {
    const h = await openCustomer('/app/customer/new?category=inspection');
    expect(radios(h)[2].classList.contains('nm-category-tile--selected')).toBe(true);
    expect(radios(h)[0].classList.contains('nm-category-tile--selected')).toBe(false);
    expect(declared('.nm-category-tile--selected', 'border-color')).toContain('var(--nitume-green)');
    expect(declared('.nm-category-tile--selected::after', 'border')).toEqual(['2px solid var(--nitume-green-050)']);
    expect(declared('.nm-category-tile', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(noShadow()).toBe(true);
  });

  it('NC T7. icons blue in green-050 boxes: shopping-bag, local-shipping, fact-check, location, hourglass', async () => {
    const h = await openCustomer('/app/customer/new');
    expect(radios(h).map((r) => r.querySelector('nm-icon')?.getAttribute('data-icon'))).toEqual([
      'shopping-bag',
      'local-shipping',
      'fact-check',
      'location',
      'hourglass',
    ]);
    expect(declared('.nm-category-tile__icon', 'color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-category-tile__icon', 'background-color')).toEqual(['var(--nitume-green-050)']);
  });

  it('NC T8. Continue → navigates to /app/customer/new/details and the store holds the category', async () => {
    const h = await openCustomer('/app/customer/new');
    const store = draftOf(h, NewCategoryPage);
    radios(h)[3].click();
    await h.detect();
    cta(h).click();
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/new/details'));
    expect(store.category()).toBe('representation');
  });

  it('NC T9 empty. Back with an empty draft leaves without a dialog', async () => {
    const h = await openCustomer('/app/customer/new');
    (h.root().querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/home'));
    expect(document.body.querySelector('nm-dialog')).toBeNull();
  });

  it('NC T9 data. the dialog has the exact copy and order; Keep editing stays; Discard leaves and resets', async () => {
    const h = await openCustomer('/app/customer/new?category=inspection');
    const store = draftOf(h, NewCategoryPage);
    store.title.set('Apartment check');
    const back = h.root().querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    back.click();
    await h.detect();
    expect(text(document.body.querySelector('nm-dialog h2'))).toBe('Discard this task?');
    expect(text(document.body.querySelector('nm-dialog p'))).toBe("What you've entered so far will be lost.");
    const actions = dialogActions();
    expect(actions.map((a) => a.label)).toEqual(['Discard', 'Keep editing']);
    expect(actions[0].classes).toContain('nm-btn--outline');
    expect(actions[0].classes).toContain('nm-btn--destructive');
    expect(actions[1].classes).toContain('nm-btn--primary');
    dialogButton('Keep editing').click();
    await h.detect();
    expect(h.router.url).toBe('/app/customer/new?category=inspection');
    expect(store.title()).toBe('Apartment check');

    back.click();
    await h.detect();
    dialogButton('Discard').click();
    await h.detect();
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/home'));
    expect(store.hasData()).toBe(false);
    expect(document.body.querySelectorAll('nm-dialog')).toHaveLength(0); // asked once only
  });

  it('NC T10. grid in link mode (Home) renders links to /app/customer/new?category=<wire> and never a selected state', () => {
    @Component({
      imports: [NmCategoryGrid],
      template: `<nm-category-grid mode="link" selected="inspection" [linkFor]="link" />`,
    })
    class Host {
      readonly link = (c: string) => `/app/customer/new?category=${c}`;
    }
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/app/customer/new?category=buy_for_me',
      '/app/customer/new?category=pickup_delivery',
      '/app/customer/new?category=inspection',
      '/app/customer/new?category=representation',
      '/app/customer/new?category=queue_admin',
    ]);
    expect(root.querySelector('.nm-category-tile--selected, [aria-checked]')).toBeNull();
  });
});
