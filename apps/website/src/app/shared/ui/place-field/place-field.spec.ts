// G7-25 / G7-28: `nm-place-field` and `nm-places-attribution` at component
// level, with a fake PLACE_SEARCH. The view cases ND T6–T12, T22 run on the
// real details step (new-details.page.spec.ts).
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cssRuleValues, declared, rawStyles } from '../../../../testing/css';
import { PLACE_SEARCH, PlaceDetails, PlaceSearch, PlaceSuggestion, SavedPlace } from '../../places/place-search';
import { NmPlaceField } from './place-field.component';

class FakeSearch implements PlaceSearch {
  readonly available = signal(true).asReadonly();
  attributionRequired = true;
  tokens = 0;
  readonly autocomplete = vi.fn(
    async (query: string, _token: unknown): Promise<PlaceSuggestion[]> => [
      { placeId: 'p1', primaryText: `${query} Centre`, secondaryText: 'Westlands, Nairobi', source: 'google' },
      { placeId: 'p2', primaryText: `${query} Mall`, secondaryText: null, source: 'google' },
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
    return { token: ++this.tokens };
  }
}

const SAVED: SavedPlace[] = [{ id: 'a1', label: 'Home', addressText: 'Kilimani, Nairobi', lat: -1.29, lon: 36.78 }];

@Component({
  imports: [NmPlaceField],
  template: `
    <nm-place-field
      ariaLabel="Location"
      [value]="value()"
      [error]="error()"
      [savedAddresses]="saved()"
      [focusRequest]="focus()"
      (placeSelected)="value.set($event); picks.push($event)"
      (selectionCleared)="value.set(null); cleared = cleared + 1"
      (textChange)="texts.push($event)"
    />
    <button type="button" class="outside">Outside</button>
  `,
})
class Host {
  readonly value = signal<PlaceDetails | null>(null);
  readonly error = signal<string | null>(null);
  readonly saved = signal<SavedPlace[]>(SAVED);
  readonly focus = signal(0);
  readonly picks: PlaceDetails[] = [];
  readonly texts: string[] = [];
  cleared = 0;
}

function setup() {
  const search = new FakeSearch();
  TestBed.configureTestingModule({ providers: [{ provide: PLACE_SEARCH, useValue: search }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = () => root.querySelector('nm-place-field input') as HTMLInputElement;
  const options = () => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const key = (k: string) => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, root, input, options, type, key, flush, search };
}

describe('nm-place-field (G7-25)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders an nm-field combobox: location icon, placeholder, name from the heading, aria-controls the listbox, closed', () => {
    const { input, root } = setup();
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('placeholder')).toBe('Search for a place');
    expect(input().labels?.[0]?.textContent).toBe('Location');
    expect(root.querySelector('nm-place-field nm-field nm-icon')?.getAttribute('data-icon')).toBe('location');
    expect(input().getAttribute('aria-controls')).toMatch(/^nm-place-list-/);
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });

  it('debounce: no search under 2 characters; one search 300 ms after the last keystroke; busy while it runs', async () => {
    const { type, search, input, flush, fixture } = setup();
    type('S');
    await vi.advanceTimersByTimeAsync(400);
    expect(search.autocomplete).not.toHaveBeenCalled();
    type('Sa');
    await vi.advanceTimersByTimeAsync(200);
    type('Sar');
    await vi.advanceTimersByTimeAsync(299);
    expect(search.autocomplete).not.toHaveBeenCalled();
    let release: (v: PlaceSuggestion[]) => void = () => undefined;
    search.autocomplete.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(search.autocomplete).toHaveBeenCalledTimes(1);
    expect(search.autocomplete.mock.calls[0][0]).toBe('Sar');
    expect(input().getAttribute('aria-busy')).toBe('true');
    release([]);
    await flush();
    expect(input().hasAttribute('aria-busy')).toBe(false);
  });

  it('keyboard: ArrowDown moves the active option (aria-activedescendant), Enter picks, Escape closes and keeps the text', async () => {
    const { type, key, input, options, host, flush, root } = setup();
    type('Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toHaveLength(2);
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    key('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().value).toBe('Sarit');
    key('ArrowDown');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    key('Enter');
    await flush();
    expect(host.picks.map((p) => p.placeId)).toEqual(['p2']);
    expect(input().value).toBe('Sarit Centre, Westlands, Nairobi');
    expect(root.querySelector('[role="listbox"]')).toBeNull();
  });

  it('saved addresses on focus with empty text (bookmark, label + address); picking one sends placeId null and lng from lon, no Places call', async () => {
    const { input, options, host, search, fixture } = setup();
    input().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    expect(options().map((o) => o.querySelector('.nm-place-field__title')?.textContent)).toEqual(['Home']);
    expect(options().map((o) => o.querySelector('.nm-place-field__sub')?.textContent)).toEqual(['Kilimani, Nairobi']);
    expect(options()[0].querySelector('nm-icon')?.getAttribute('data-icon')).toBe('bookmark');
    options()[0].click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(host.picks).toEqual([{ addressText: 'Kilimani, Nairobi', lat: -1.29, lng: 36.78, placeId: null }]);
    expect(search.details).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('nm-places-attribution')).toBeNull();
  });

  it('a pick holds only while the text matches: the first edit emits selectionCleared', async () => {
    const { type, host, flush, options } = setup();
    type('Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    options()[0].click();
    await flush();
    expect(host.value()?.placeId).toBe('p1');
    type('Sarit Centre, Westlands, Nairob');
    expect(host.cleared).toBe(1);
    expect(host.value()).toBeNull();
  });

  it('search failure shows the error line through the field and clears on the next input', async () => {
    const { type, search, flush, root } = setup();
    search.autocomplete.mockRejectedValueOnce(new Error('offline'));
    type('Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    const alert = root.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toBe("Couldn't search places. Check your connection.");
    type('Sari');
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('attribution: Google suggestions end with img[alt="Google Maps"] (the third-party asset, 16px) outside the listbox', async () => {
    const { type, flush, root } = setup();
    type('Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    const img = root.querySelector('img[alt="Google Maps"]') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('assets/third-party/google-maps-attribution.svg');
    expect(img.closest('[role="listbox"]')).toBeNull();
    expect(img.closest('.nm-place-field__panel')?.lastElementChild?.tagName.toLowerCase()).toBe('nm-places-attribution');
    expect(getComputedStyle(img).height).toBe('16px');
  });

  it('focusRequest: an increase focuses the native input', () => {
    const { fixture, host, input } = setup();
    host.focus.set(1);
    fixture.detectChanges();
    expect(document.activeElement).toBe(input());
  });

  it('G7-28. row tokens (48px, hairline, slate-400 icon, row-title / muted-sm), active option ring, focus ring of nm-field, tokens only', async () => {
    const { type, flush } = setup();
    type('Sarit');
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(declared('.nm-place-field__option', 'min-height')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-place-field__option', 'padding')).toEqual(['10px 4px']);
    expect(declared('.nm-place-field__option', 'border-bottom')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-place-field__icon', 'color')).toEqual(['var(--nitume-slate-400)']);
    expect(declared('.nm-place-field__title', 'font-size')).toEqual(['13.5px']);
    expect(declared('.nm-place-field__sub', 'font-size')).toEqual(['11.5px']);
    expect(cssRuleValues(['.nm-place-field__option', ':hover'], 'background-color')).toEqual(['var(--nitume-slate)']);
    expect(declared('.nm-place-field__option--active', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(cssRuleValues(['.nm-field__input', ':focus'], 'outline')).toContain('2px solid var(--nitume-green)');
    expect(rawStyles()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|box-shadow/);
  });
});
