// customer-v-new-details.md, Required tests (G7-31; places G7-25/G7-26,
// shopping list G7-27, chips G7-18). ND T11 runs in shared/places
// (GooglePlaceSearch), ND T16 in shared/kit-additions-7.spec.ts and ND T17
// in task-draft.store.spec.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Location } from '@angular/common';
import { Component, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppHarness, text, typeInto } from '../../../../testing/app-harness';
import { API, expectRequest } from '../../../../testing/auth';
import { declared } from '../../../../testing/css';
import { draftOf, openCustomer } from '../../../../testing/customer';
import { MAPS_API_KEY, MapsLoaderService } from '../../../shared/map/maps-loader.service';
import { GooglePlaceSearch, PlacesLibrary } from '../../../shared/places/google-place-search';
import { PLACE_SEARCH, PlaceDetails, PlaceSearch, PlaceSuggestion } from '../../../shared/places/place-search';
import { NmChoiceChipGroup } from '../../../shared/ui/choice-chip/choice-chip-group.component';
import { SavedAddress } from '../data/addresses.api';
import { NewCategoryPage } from './new-category.page';
import { DETAILS_ERRORS, NewDetailsPage } from './new-details.page';
import { DraftPlace, TaskDraftStore, WizardCategory } from './task-draft.store';

const P1: DraftPlace = { addressText: 'Nyali, Mombasa', lat: -4.04, lng: 39.7, placeId: 'p-nyali' };
const P2: DraftPlace = { addressText: 'Kilimani, Nairobi', lat: -1.29, lng: 36.78, placeId: 'p-kilimani' };
const SAVED: SavedAddress[] = [
  { id: 'a1', label: 'Office', addressText: 'Upper Hill, Nairobi', lat: -1.3, lon: 36.81 },
  { id: 'a2', label: 'Home', addressText: 'Kilimani, Nairobi', lat: -1.29, lon: 36.78 },
  { id: 'a3', label: 'Gym', addressText: 'No pin yet', lat: null, lon: null },
];

interface DetailsOptions {
  providers?: Provider[];
  addresses?: SavedAddress[] | 'fail';
  defaults?: { defaultDeadlineHours: number; defaultDeadlineStartsAt: string } | 'fail';
  before?: (store: TaskDraftStore) => void;
  width?: number;
}

async function openDetails(category: WizardCategory, opts: DetailsOptions = {}) {
  const h = await openCustomer(`/app/customer/new?category=${category}`, { providers: opts.providers, width: opts.width });
  opts.before?.(draftOf(h, NewCategoryPage));
  await h.harness.navigateByUrl('/app/customer/new/details');
  const addresses = await expectRequest(`${API}/customers/me/addresses`);
  if (opts.addresses === 'fail') addresses.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
  else addresses.flush(opts.addresses ?? []);
  const defaults = await expectRequest(`${API}/errands/defaults`);
  if (opts.defaults === 'fail') defaults.error(new ProgressEvent('error'), { status: 0 });
  else defaults.flush(opts.defaults ?? { defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
  await h.detect();
  return { h, store: draftOf(h, NewDetailsPage) };
}

const form = (h: AppHarness) => h.root().querySelector('app-new-details-page form') as HTMLFormElement;
const headings = (h: AppHarness) => Array.from(form(h).querySelectorAll('.nm-form-card__label')).map((e) => text(e));
const visibleLabels = (h: AppHarness) =>
  Array.from(form(h).querySelectorAll('nm-place-field label:not(.nm-field__label--hidden)')).map((e) => text(e));
const alerts = (h: AppHarness) => Array.from(form(h).querySelectorAll('[role="alert"]')).map((e) => text(e));
const input = (h: AppHarness, key: string) =>
  h.root().querySelector(`[data-field="${key}"] input, [data-field="${key}"] textarea`) as HTMLInputElement;
const continueButton = (h: AppHarness) =>
  Array.from(h.root().querySelectorAll<HTMLButtonElement>('nm-fixed-cta button')).find((b) => text(b) === 'Continue →') as HTMLButtonElement;
async function clickContinue(h: AppHarness) {
  continueButton(h).click();
  await h.detect();
}
const options = (h: AppHarness, key: string) =>
  Array.from(h.root().querySelectorAll<HTMLElement>(`[data-field="${key}"] [role="option"]`));
const focusIn = (el: HTMLElement) => el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

/** Fills a valid draft for the category. */
function fill(store: TaskDraftStore): void {
  store.description.set('Please check the apartment');
  store.first.set(P1);
  if (store.twoPoints()) store.dropoff.set(P2);
  if (store.isBuy()) {
    store.items.set([{ name: 'Milk', quantity: 1 }]);
    store.budget.set(500);
  }
}

class FakeSearch implements PlaceSearch {
  readonly available = signal(true).asReadonly();
  attributionRequired = true;
  private n = 0;
  readonly autocomplete = vi.fn(
    async (query: string, _token: unknown): Promise<PlaceSuggestion[]> => [
      { placeId: 'g1', primaryText: `${query} Centre`, secondaryText: 'Westlands, Nairobi', source: 'google' },
      { placeId: 'g2', primaryText: `${query} Mall`, secondaryText: null, source: 'google' },
    ],
  );
  readonly details = vi.fn(
    async (placeId: string, _token: unknown): Promise<PlaceDetails> => ({
      placeId,
      addressText: 'Sarit Centre, Westlands, Nairobi',
      lat: -1.26,
      lng: 36.8,
    }),
  );
  newSessionToken(): unknown {
    return { session: ++this.n };
  }
}

function fakeLibrary() {
  class Token {}
  const fetchAutocompleteSuggestions = vi.fn(async (request: { input: string; sessionToken: object }) => ({
    suggestions: [
      { placePrediction: { placeId: `pid-${request.input}`, mainText: { text: `${request.input} Centre` }, secondaryText: { text: 'Nairobi' } } },
    ],
  }));
  const placeOptions: { id: string; sessionToken?: object }[] = [];
  class Place {
    id: string;
    displayName = 'Sarit Centre';
    formattedAddress = 'Westlands, Nairobi';
    location = { lat: () => -1.26, lng: () => 36.8 };
    constructor(options: { id: string; sessionToken?: object }) {
      this.id = options.id;
      placeOptions.push(options);
    }
    async fetchFields() {
      return {};
    }
  }
  const library = {
    AutocompleteSessionToken: Token,
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    Place,
  } as unknown as PlacesLibrary;
  return { library, fetchAutocompleteSuggestions, placeOptions };
}

const fakeSearchProviders = (search: PlaceSearch): Provider[] => [
  { provide: MAPS_API_KEY, useValue: 'test-key' },
  { provide: PLACE_SEARCH, useValue: search },
];

async function typePlace(h: AppHarness, key: string, value: string) {
  typeInto(input(h, key), value);
  await h.detect();
}

describe('customer v-new-details (#7)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ND T1. per-category matrix: cards in order with the exact headings and field labels', async () => {
    const expected: Record<WizardCategory, { headings: string[]; labels: string[] }> = {
      inspection: { headings: ['Task title (optional)', 'Describe the task', 'Location', 'Deadline'], labels: [] },
      representation: { headings: ['Task title (optional)', 'Describe the task', 'Location', 'Deadline'], labels: [] },
      queue_admin: { headings: ['Task title (optional)', 'Describe the task', 'Location', 'Deadline'], labels: [] },
      pickup_delivery: {
        headings: ['Task title (optional)', 'Describe the task', 'Deadline', 'Budget (if a purchase is involved)'],
        labels: ['Pick up from', 'Deliver to'],
      },
      buy_for_me: {
        headings: ['Task title (optional)', 'Describe the task', 'Shopping list', 'Deadline', 'Budget (if a purchase is involved)'],
        labels: ['Buy from', 'Deliver to'],
      },
    };
    for (const [category, want] of Object.entries(expected) as [WizardCategory, (typeof expected)[WizardCategory]][]) {
      const { h } = await openDetails(category);
      expect.soft(headings(h), category).toEqual(want.headings);
      expect.soft(visibleLabels(h), category).toEqual(want.labels);
      expect.soft(text(h.root().querySelector('nm-pushed-header h1')), category).toBe('Task details');
      expect.soft(text(h.root().querySelector('nm-pushed-header [nmNum]')), category).toBe('Step 2 of 3');
    }
  });

  it('ND T2. placeholders and the KSh prefix exactly; budget and quantities in Fira Code', async () => {
    const { h } = await openDetails('buy_for_me');
    expect(input(h, 'title').getAttribute('placeholder')).toBe('e.g. Apartment check — Nyali');
    expect(input(h, 'description').getAttribute('placeholder')).toBe(
      'e.g. Check the apartment in Nyali — video the compound, both bedrooms and bathroom.',
    );
    expect(input(h, 'first').getAttribute('placeholder')).toBe('Search for a place');
    expect(input(h, 'dropoff').getAttribute('placeholder')).toBe('Search for a place');
    expect(input(h, 'items').getAttribute('placeholder')).toBe('Item, e.g. 2kg sugar');
    const budget = input(h, 'budget');
    expect(budget.getAttribute('placeholder')).toBe('0');
    const prefix = h.root().querySelector('[data-field="budget"] .nm-field__prefix') as HTMLElement;
    expect(prefix.textContent).toBe('KSh ');
    expect(prefix.hasAttribute('nmNum')).toBe(true);
    expect(budget.classList.contains('nm-field__input--num')).toBe(true);
    expect(declared('.nm-field__input--num', 'font-family')).toEqual(['var(--nitume-font-num)']);
    const qty = h.root().querySelector('.nm-shopping-list__qty [nmNum]') as HTMLElement;
    expect(getComputedStyle(qty).fontFamily).toBe('var(--nitume-font-num)');
  });

  it('ND T3. every validation message, each alone, only after the first Continue →, then live', async () => {
    type Case = {
      category: WizardCategory;
      message: string;
      breakIt: (s: TaskDraftStore, h: AppHarness) => Promise<void> | void;
      fix: (s: TaskDraftStore) => void;
    };
    const cases: Case[] = [
      { category: 'inspection', message: DETAILS_ERRORS.titleLong, breakIt: (s) => s.title.set('x'.repeat(61)), fix: (s) => s.title.set('Short title') },
      { category: 'inspection', message: DETAILS_ERRORS.titleShort, breakIt: (s) => s.title.set('ab'), fix: (s) => s.title.set('') },
      { category: 'inspection', message: DETAILS_ERRORS.description, breakIt: (s) => s.description.set('abcd'), fix: (s) => s.description.set('abcde') },
      {
        category: 'inspection',
        message: DETAILS_ERRORS.pickFromList,
        breakIt: async (s, h) => {
          s.first.set(null);
          await h.detect();
          await typePlace(h, 'first', 'Nyali');
        },
        fix: (s) => s.first.set(P1),
      },
      { category: 'inspection', message: DETAILS_ERRORS.location, breakIt: (s) => s.first.set(null), fix: (s) => s.first.set(P1) },
      { category: 'pickup_delivery', message: DETAILS_ERRORS.pickup, breakIt: (s) => s.first.set(null), fix: (s) => s.first.set(P1) },
      { category: 'buy_for_me', message: DETAILS_ERRORS.buyFrom, breakIt: (s) => s.first.set(null), fix: (s) => s.first.set(P1) },
      {
        category: 'pickup_delivery',
        message: DETAILS_ERRORS.pickFromList,
        breakIt: async (s, h) => {
          s.dropoff.set(null);
          await h.detect();
          await typePlace(h, 'dropoff', 'Kilim');
        },
        fix: (s) => s.dropoff.set(P2),
      },
      { category: 'pickup_delivery', message: DETAILS_ERRORS.dropoff, breakIt: (s) => s.dropoff.set(null), fix: (s) => s.dropoff.set(P2) },
      {
        category: 'buy_for_me',
        message: DETAILS_ERRORS.items,
        breakIt: (s) => s.items.set([{ name: '  ', quantity: 1 }]),
        fix: (s) => s.items.set([{ name: 'Milk', quantity: 1 }]),
      },
      { category: 'pickup_delivery', message: DETAILS_ERRORS.budgetMax, breakIt: (s) => s.budget.set(1_000_001), fix: (s) => s.budget.set(1_000_000) },
      { category: 'buy_for_me', message: DETAILS_ERRORS.budgetRequired, breakIt: (s) => s.budget.set(null), fix: (s) => s.budget.set(10) },
    ];
    for (const c of cases) {
      const { h, store } = await openDetails(c.category);
      fill(store);
      await h.detect();
      await c.breakIt(store, h);
      await h.detect();
      expect.soft(alerts(h), `${c.message} before Continue`).toEqual([]);
      await clickContinue(h);
      expect.soft(alerts(h), c.message).toEqual([c.message]);
      expect.soft(h.router.url, c.message).toBe('/app/customer/new/details');
      c.fix(store);
      await h.detect();
      expect.soft(alerts(h), `${c.message} fixed`).toEqual([]);
    }
  });

  it('ND T4. first-error focus: description and budget invalid → focus on the description field', async () => {
    const { h, store } = await openDetails('buy_for_me');
    fill(store);
    store.description.set('');
    store.budget.set(null);
    await h.detect();
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.description, DETAILS_ERRORS.budgetRequired]);
    expect(document.activeElement).toBe(input(h, 'description'));
  });

  it('ND T5. title: ab → 3-character message; 61 characters → 60 message; empty → valid and omitted from the body', async () => {
    const { h, store } = await openDetails('inspection');
    fill(store);
    typeInto(input(h, 'title'), 'ab');
    await h.detect();
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.titleShort]);
    typeInto(input(h, 'title'), 'x'.repeat(61));
    await h.detect();
    expect(alerts(h)).toEqual([DETAILS_ERRORS.titleLong]);
    expect(input(h, 'title').hasAttribute('maxlength')).toBe(false);
    typeInto(input(h, 'title'), '');
    await h.detect();
    expect(alerts(h)).toEqual([]);
    expect('title' in store.toRequest(new Date())).toBe(false);
  });

  it('ND T6. typed text without a pick → Choose a place from the list.; pick then edit one character drops the place; re-pick restores validity', async () => {
    const { h, store } = await openDetails('inspection', { addresses: SAVED });
    fill(store);
    store.first.set(null);
    await h.detect();
    await typePlace(h, 'first', 'Upper');
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.pickFromList]);
    // Pick a saved address (empty text lists them on focus).
    await typePlace(h, 'first', '');
    focusIn(input(h, 'first'));
    await h.detect();
    options(h, 'first')[0].click();
    await h.detect();
    expect(store.first()?.addressText).toBe('Upper Hill, Nairobi');
    expect(alerts(h)).toEqual([]);
    await typePlace(h, 'first', 'Upper Hill, Nairob');
    expect(store.first()).toBeNull();
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.pickFromList]);
    await typePlace(h, 'first', '');
    focusIn(input(h, 'first'));
    await h.detect();
    options(h, 'first')[0].click();
    await h.detect();
    expect(store.first()).not.toBeNull();
    expect(alerts(h)).toEqual([]);
  });

  it('ND T7. debounce and caching: none under 2 characters; one call at 300 ms; same query in a session cached; details with the same token then a new one; only the latest answer renders', async () => {
    const fake = fakeLibrary();
    const google = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    const { h } = await openDetails('inspection', { providers: fakeSearchProviders(google) });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await typePlace(h, 'first', 'S');
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    await typePlace(h, 'first', 'Sa');
    await vi.advanceTimersByTimeAsync(299);
    expect(fake.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await h.detect();
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    const token = fake.fetchAutocompleteSuggestions.mock.calls[0][0].sessionToken;
    await typePlace(h, 'first', 'Sar');
    await vi.advanceTimersByTimeAsync(300);
    await typePlace(h, 'first', 'Sa');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(2); // 'Sa' again: from the session cache
    expect(options(h, 'first').map((o) => text(o.querySelector('.nm-place-field__title')))).toEqual(['Sa Centre']);
    options(h, 'first')[0].click();
    await vi.advanceTimersByTimeAsync(0);
    await h.detect();
    expect(fake.placeOptions[0].sessionToken).toBe(token);
    await typePlace(h, 'first', 'Westgate');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    expect(fake.fetchAutocompleteSuggestions.mock.calls[2][0].sessionToken).not.toBe(token);

    // Only the latest search's results render.
    let releaseSlow: (v: { suggestions: unknown[] }) => void = () => undefined;
    fake.fetchAutocompleteSuggestions.mockImplementationOnce(() => new Promise((r) => (releaseSlow = r as never)));
    await typePlace(h, 'first', 'Slow');
    await vi.advanceTimersByTimeAsync(300);
    await typePlace(h, 'first', 'Fast');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    releaseSlow({ suggestions: [{ placePrediction: { placeId: 'old', mainText: { text: 'Stale' } } }] });
    await vi.advanceTimersByTimeAsync(0);
    await h.detect();
    expect(options(h, 'first').map((o) => text(o.querySelector('.nm-place-field__title')))).toEqual(['Fast Centre']);
  });

  it('ND T8. a details failure keeps the list and the field; a search failure shows the line and clears on the next input', async () => {
    const search = new FakeSearch();
    const { h, store } = await openDetails('inspection', { providers: fakeSearchProviders(search) });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await typePlace(h, 'first', 'Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    search.details.mockRejectedValueOnce(new Error('no location'));
    options(h, 'first')[0].click();
    await vi.advanceTimersByTimeAsync(0);
    await h.detect();
    expect(options(h, 'first')).toHaveLength(2);
    expect(input(h, 'first').value).toBe('Sarit');
    expect(store.first()).toBeNull();

    search.autocomplete.mockRejectedValueOnce(new Error('offline'));
    await typePlace(h, 'first', 'Sarit C');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    expect(alerts(h)).toEqual(["Couldn't search places. Check your connection."]);
    await typePlace(h, 'first', 'Sarit Ce');
    expect(alerts(h)).toEqual([]);
  });

  it('ND T9. saved addresses on focus with empty text (only those with lat and lon), label + address; a pick sends no placeId and lon from the address', async () => {
    const { h, store } = await openDetails('inspection', { addresses: SAVED });
    focusIn(input(h, 'first'));
    await h.detect();
    expect(options(h, 'first').map((o) => text(o.querySelector('.nm-place-field__title')))).toEqual(['Office', 'Home']);
    expect(options(h, 'first').map((o) => text(o.querySelector('.nm-place-field__sub')))).toEqual(['Upper Hill, Nairobi', 'Kilimani, Nairobi']);
    options(h, 'first')[1].click();
    await h.detect();
    store.description.set('Check the house please');
    const location = store.toRequest(new Date()).locations[0];
    expect(location).toEqual({ pointType: 'task_site', lat: -1.29, lon: 36.78, addressText: 'Kilimani, Nairobi' });
    expect('placeId' in location).toBe(false);
  });

  it('ND T10 no key. the notice renders; typing Off finds Office; no script, importLibrary never called, no attribution', async () => {
    const importLibrary = vi.spyOn(MapsLoaderService.prototype, 'importLibrary');
    const { h } = await openDetails('inspection', { addresses: SAVED });
    expect(text(h.root().querySelector('.details__notice'))).toBe(
      "Place search isn't available yet. Choose one of your saved addresses that has a map location.",
    );
    await typePlace(h, 'first', 'Off');
    await vi.waitFor(async () => {
      await h.detect();
      expect(options(h, 'first')).toHaveLength(1);
    });
    expect(text(options(h, 'first')[0].querySelector('.nm-place-field__title'))).toBe('Office');
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    expect(importLibrary).not.toHaveBeenCalled();
    expect(h.root().querySelector('img[alt="Google Maps"]')).toBeNull();
  });

  it('ND T10 key, library null. typing shows the search-failure line, no notice, saved addresses still listed on focus', async () => {
    vi.spyOn(MapsLoaderService.prototype, 'importLibrary').mockResolvedValue(null);
    const { h } = await openDetails('inspection', {
      addresses: SAVED,
      providers: [{ provide: MAPS_API_KEY, useValue: 'test-key' }],
    });
    expect(h.root().querySelector('.details__notice')).toBeNull();
    await typePlace(h, 'first', 'Sarit');
    await vi.waitFor(async () => {
      await h.detect();
      expect(alerts(h)).toEqual(["Couldn't search places. Check your connection."]);
    });
    await typePlace(h, 'first', '');
    focusIn(input(h, 'first'));
    await h.detect();
    expect(options(h, 'first').map((o) => text(o.querySelector('.nm-place-field__title')))).toEqual(['Office', 'Home']);
  });

  it('ND T12. combobox keyboard: ArrowDown + Enter picks, Escape closes; aria-expanded and aria-activedescendant update', async () => {
    const search = new FakeSearch();
    const { h, store } = await openDetails('inspection', { providers: fakeSearchProviders(search) });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await typePlace(h, 'first', 'Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    const field = input(h, 'first');
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    const key = async (k: string) => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      await h.detect();
    };
    await key('ArrowDown');
    expect(field.getAttribute('aria-activedescendant')).toBe(options(h, 'first')[0].id);
    await key('Escape');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(field.hasAttribute('aria-activedescendant')).toBe(false);
    expect(field.value).toBe('Sarit');
    await key('ArrowDown');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    await key('Enter');
    await vi.advanceTimersByTimeAsync(0);
    await h.detect();
    expect(store.first()?.placeId).toBe('g1');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });

  it('ND T13. shopping list: up to 30 rows then the link hides; remove hidden with one row; quantity 1 and 99; maxlength 80; names include the item; adding focuses the new field', async () => {
    const { h, store } = await openDetails('buy_for_me');
    const list = () => h.root().querySelector('nm-shopping-list') as HTMLElement;
    const add = () => list().querySelector('.nm-shopping-list__add button') as HTMLButtonElement | null;
    expect(list().querySelector('.nm-shopping-list__remove')).toBeNull();
    expect(list().querySelector('input')?.getAttribute('maxlength')).toBe('80');
    const [minus] = Array.from(list().querySelectorAll<HTMLButtonElement>('.nm-shopping-list__step'));
    expect(minus.getAttribute('aria-disabled')).toBe('true');
    store.items.set([{ name: '2kg sugar', quantity: 99 }]);
    await h.detect();
    const plus = list().querySelectorAll<HTMLButtonElement>('.nm-shopping-list__step')[1];
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    expect(plus.getAttribute('aria-label')).toBe('Increase quantity of 2kg sugar');
    add()?.click();
    await h.detect();
    expect(document.activeElement).toBe(list().querySelectorAll('input')[1]);
    expect(list().querySelector('.nm-shopping-list__remove')?.getAttribute('aria-label')).toBe('Remove item 2kg sugar');
    while (store.items().length < 30) {
      add()?.click();
      await h.detect();
    }
    expect(add()).toBeNull();
  });

  it('ND T14. deadline chips: radio semantics, Today by default, selected blue fill with white text, arrows move and select; a disabled chip (#8) ignores clicks', async () => {
    const { h, store } = await openDetails('inspection');
    const group = h.root().querySelector('nm-choice-chip-group [role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Deadline');
    const chips = () => Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(chips().map((c) => text(c))).toEqual(['Today', 'Tomorrow', 'Flexible']);
    expect(chips().map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(chips()[0].classList.contains('nm-choice-chip--selected')).toBe(true);
    expect(declared('.nm-choice-chip--selected', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-choice-chip--selected', 'color')).toEqual(['var(--nitume-white)']);
    chips()[0].focus();
    chips()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await h.detect();
    expect(store.deadline()).toBe('tomorrow');
    expect(document.activeElement).toBe(chips()[1]);

    @Component({
      imports: [NmChoiceChipGroup],
      template: `<nm-choice-chip-group [options]="opts" selected="today" [disabled]="true" ariaLabel="Deadline" (selectedChange)="picked = $event" />`,
    })
    class Saving {
      readonly opts = [
        { value: 'today', label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
      ];
      picked: string | null = null;
    }
    const fixture = TestBed.createComponent(Saving);
    fixture.detectChanges();
    const disabled = fixture.nativeElement.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement;
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    disabled.click();
    expect(fixture.componentInstance.picked).toBeNull();
  });

  it('ND T15. Flexible caption: 24 hours in nmNum; 1 → 1 hour; failure or another start → hidden; hidden for Today/Tomorrow', async () => {
    const caption = (h: AppHarness) => h.root().querySelector('.details__caption--flexible') as HTMLElement | null;
    let { h, store } = await openDetails('inspection');
    expect(caption(h)).toBeNull();
    store.deadline.set('flexible');
    await h.detect();
    expect(text(caption(h))).toBe("No fixed time. Your task's deadline is 24 hours after your payment is confirmed.");
    expect(text(caption(h)?.querySelector('[nmNum]'))).toBe('24 hours');
    expect(getComputedStyle(caption(h) as HTMLElement).fontSize).toBe('12px');
    expect(getComputedStyle(caption(h) as HTMLElement).color).toBe('var(--nitume-slate-600)');
    store.deadline.set('tomorrow');
    await h.detect();
    expect(caption(h)).toBeNull();

    ({ h, store } = await openDetails('inspection', { defaults: { defaultDeadlineHours: 1, defaultDeadlineStartsAt: 'payment_confirmed' } }));
    store.deadline.set('flexible');
    await h.detect();
    expect(text(caption(h)?.querySelector('[nmNum]'))).toBe('1 hour');

    ({ h, store } = await openDetails('inspection', { defaults: 'fail' }));
    store.deadline.set('flexible');
    await h.detect();
    expect(caption(h)).toBeNull();

    ({ h, store } = await openDetails('inspection', { defaults: { defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'created' } }));
    store.deadline.set('flexible');
    await h.detect();
    expect(caption(h)).toBeNull();
  });

  it('ND T18. budget: digits only; 1000001 → limit message; Buy with an empty budget → required; Get with an empty budget is valid', async () => {
    let { h, store } = await openDetails('pickup_delivery');
    fill(store);
    typeInto(input(h, 'budget'), '12a3');
    await h.detect();
    expect(input(h, 'budget').value).toBe('123');
    expect(store.budget()).toBe(123);
    typeInto(input(h, 'budget'), '1000001');
    await h.detect();
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.budgetMax]);
    typeInto(input(h, 'budget'), '');
    await h.detect();
    expect(alerts(h)).toEqual([]); // Get: empty is valid
    expect(store.toRequest(new Date()).budget).toBe(0);

    ({ h, store } = await openDetails('buy_for_me'));
    fill(store);
    store.budget.set(null);
    await h.detect();
    await clickContinue(h);
    expect(alerts(h)).toEqual([DETAILS_ERRORS.budgetRequired]);
  });

  it('ND T19. a valid Continue → sets detailsValidated and opens the review; Back keeps every value, places and items included', async () => {
    const { h, store } = await openDetails('buy_for_me');
    typeInto(input(h, 'title'), 'Groceries');
    typeInto(input(h, 'description'), 'Buy the weekly groceries');
    store.first.set(P1);
    store.dropoff.set(P2);
    store.items.set([{ name: '2kg sugar', quantity: 2 }]);
    typeInto(input(h, 'budget'), '4000');
    await h.detect();
    await clickContinue(h);
    await vi.waitFor(() => expect(h.router.url).toBe('/app/customer/new/review'));
    expect(store.detailsValidated).toBe(true);
    // Header Back is history back (the previous page is step 2); the mock location does not pop.
    const back = vi.spyOn(Location.prototype, 'back').mockImplementation(() => undefined);
    (h.root().querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalledTimes(1);
    await h.harness.navigateByUrl('/app/customer/new/details');
    (await expectRequest(`${API}/customers/me/addresses`)).flush([]);
    (await expectRequest(`${API}/errands/defaults`)).flush({ defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
    await h.detect();
    expect(input(h, 'title').value).toBe('Groceries');
    expect(input(h, 'description').value).toBe('Buy the weekly groceries');
    expect(input(h, 'first').value).toBe('Nyali, Mombasa');
    expect(input(h, 'dropoff').value).toBe('Kilimani, Nairobi');
    expect(input(h, 'items').value).toBe('2kg sugar');
    expect(input(h, 'budget').value).toBe('4000');
    expect(store.first()).toBe(P1);
  });

  it('ND T20. focusOnReturn dropoff on a Get It For Me draft focuses Deliver to on entry, then is cleared', async () => {
    const { h, store } = await openDetails('pickup_delivery', {
      before: (s) => {
        s.first.set(P1);
        s.dropoff.set(P2);
        s.focusOnReturn = 'dropoff';
      },
    });
    expect(document.activeElement).toBe(input(h, 'dropoff'));
    expect(input(h, 'dropoff').labels?.[0]?.textContent).toBe('Deliver to');
    expect(store.focusOnReturn).toBeNull();
  });

  it('ND T21. saved-address and defaults failures render no error and leave the form usable', async () => {
    const { h, store } = await openDetails('inspection', { addresses: 'fail', defaults: 'fail' });
    expect(alerts(h)).toEqual([]);
    expect(h.root().querySelector('nm-error-state')).toBeNull();
    typeInto(input(h, 'description'), 'Check the apartment');
    await h.detect();
    expect(store.description()).toBe('Check the apartment');
    focusIn(input(h, 'first'));
    await h.detect();
    expect(options(h, 'first')).toEqual([]);
  });

  it('ND T21a. deadline label: Today → Due today, 23:59 EAT. (23:59 in nmNum); Tomorrow → Due tomorrow; Flexible → its own caption only; the same in any browser zone', async () => {
    const tz = process.env['TZ'];
    try {
      for (const zone of ['Europe/London', 'Africa/Nairobi']) {
        process.env['TZ'] = zone;
        const { h, store } = await openDetails('inspection');
        const eat = () => h.root().querySelector('.details__caption--eat') as HTMLElement | null;
        expect.soft(text(eat()), zone).toBe('Due today, 23:59 EAT.');
        expect.soft(text(eat()?.querySelector('[nmNum]')), zone).toBe('23:59');
        expect.soft(getComputedStyle(eat() as HTMLElement).fontSize, zone).toBe('12px');
        store.deadline.set('tomorrow');
        await h.detect();
        expect.soft(text(eat()), zone).toBe('Due tomorrow, 23:59 EAT.');
        store.deadline.set('flexible');
        await h.detect();
        expect.soft(eat(), zone).toBeNull();
        expect.soft(h.root().querySelectorAll('.details__caption'), zone).toHaveLength(1);
      }
    } finally {
      if (tz === undefined) delete process.env['TZ'];
      else process.env['TZ'] = tz;
    }
  });

  it('ND T22. attribution: Google suggestions end with img[alt="Google Maps"] outside the listbox; saved-only and closed lists have none', async () => {
    const search = new FakeSearch();
    const { h } = await openDetails('inspection', { addresses: SAVED, providers: fakeSearchProviders(search) });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const img = () => h.root().querySelector('[data-field="first"] img[alt="Google Maps"]') as HTMLImageElement | null;
    focusIn(input(h, 'first'));
    await h.detect();
    expect(options(h, 'first')).toHaveLength(2); // saved only
    expect(img()).toBeNull();
    await typePlace(h, 'first', 'Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await h.detect();
    expect(img()?.getAttribute('src')).toBe('assets/third-party/google-maps-attribution.svg');
    expect(img()?.closest('[role="listbox"]')).toBeNull();
    const panel = h.root().querySelector('[data-field="first"] .nm-place-field__panel') as HTMLElement;
    expect(panel.lastElementChild?.tagName.toLowerCase()).toBe('nm-places-attribution');
    input(h, 'first').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await h.detect();
    expect(img()).toBeNull();
  });

  it('ND T23. no forms module: the form has novalidate, submit is prevented, Continue → validates from its click handler, fields use nmFieldValue', async () => {
    const { h } = await openDetails('inspection');
    expect(form(h).hasAttribute('novalidate')).toBe(true);
    expect(form(h).dispatchEvent(new Event('submit', { cancelable: true }))).toBe(false);
    await h.detect();
    expect(alerts(h)).toEqual([]); // submitting does not validate
    expect(h.root().querySelector('.ng-pristine, .ng-untouched')).toBeNull();
    await clickContinue(h);
    expect(alerts(h).length).toBeGreaterThan(0);
    const source = readFileSync(resolve(process.cwd(), 'src/app/app-area/customer/new-task/new-details.page.html'), 'utf8');
    expect(source).toContain('[nmFieldValue]');
    expect(source).not.toMatch(/ngModel|formControl/);
  });
});
