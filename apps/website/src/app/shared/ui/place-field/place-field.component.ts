// `nm-place-field` (customer-v-new-details §nm-place-field; port of
// PlaceAutocompleteField). Built on `nm-field` as an ARIA 1.2 combobox with
// a listbox. Text under 2 characters: no search. Otherwise 300 ms after the
// last keystroke `PLACE_SEARCH.autocomplete`; only the latest answer is
// used. Focus with empty text lists the saved addresses. A pick holds only
// while the text equals it (the first edit emits `selectionCleared`). Keys:
// ArrowDown/ArrowUp, Enter picks, Escape closes. Google suggestions end
// with Google's attribution, outside the listbox (WQ-26). Focus, blur and
// keys come from bubbling host listeners; `focusRequest` focuses the input.
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { PLACE_SEARCH, PLACE_SEARCH_FAILED, PlaceDetails, PlaceSuggestion, SavedPlace } from '../../places/place-search';
import { NmField } from '../field/field.component';
import { NmFieldValue } from '../field/field-value.directive';
import { NmIcon } from '../icon/icon.component';
import { NmPlacesAttribution } from './places-attribution.component';

export const PLACE_DEBOUNCE_MS = 300;
export const PLACE_MIN_CHARS = 2;

let nextId = 0;

@Component({
  selector: 'nm-place-field',
  imports: [NmField, NmFieldValue, NmIcon, NmPlacesAttribution],
  template: `
    <nm-field
      [label]="label() ?? ariaLabel()"
      [hideLabel]="!label()"
      [placeholder]="placeholder()"
      leadingIcon="location"
      [busy]="busy()"
      [role]="'combobox'"
      [ariaAutocomplete]="'list'"
      [ariaExpanded]="listOpen()"
      [ariaControls]="listId"
      [ariaActivedescendant]="activeId()"
      [error]="shownError()"
      autocomplete="off"
      [nmFieldValue]="text()"
      (nmFieldValueChange)="onText($event)"
    />
    @if (listOpen()) {
      <div class="nm-place-field__panel" (mousedown)="$event.preventDefault()">
        <ul class="nm-place-field__list" role="listbox" [id]="listId" [attr.aria-label]="label() ?? ariaLabel()">
          @for (option of results(); track option.placeId; let i = $index) {
            <li
              class="nm-place-field__option"
              [class.nm-place-field__option--active]="i === active()"
              role="option"
              [id]="optionId(i)"
              [attr.aria-selected]="i === active() ? 'true' : 'false'"
              (click)="pick(option)"
            >
              <nm-icon class="nm-place-field__icon" [name]="option.source === 'saved' ? 'bookmark' : 'location'" [size]="18" />
              <span class="nm-place-field__text">
                <span class="nm-place-field__title">{{ option.primaryText }}</span>
                @if (option.secondaryText; as sub) {
                  <span class="nm-place-field__sub">{{ sub }}</span>
                }
              </span>
            </li>
          }
        </ul>
        @if (showAttribution()) {
          <nm-places-attribution />
        }
      </div>
    }
  `,
  styleUrl: './place-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class NmPlaceField implements OnChanges, AfterViewInit {
  /** Visible label (e.g. `Pick up from`). */
  readonly label = input<string | null>(null);
  /** Accessible name when there is no visible label (the card heading). */
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('Search for a place');
  /** The picked place; its text is shown while it holds. */
  readonly value = input<PlaceDetails | null>(null);
  /** Validation error from the view (a search failure takes precedence). */
  readonly error = input<string | null>(null);
  /** Saved addresses with a map location. */
  readonly savedAddresses = input<readonly SavedPlace[]>([]);
  /** Each increase focuses the input. */
  readonly focusRequest = input(0);

  readonly placeSelected = output<PlaceDetails>();
  readonly selectionCleared = output<void>();
  readonly textChange = output<string>();

  private readonly search = inject(PLACE_SEARCH);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly listId = `nm-place-list-${nextId++}`;
  protected readonly text = signal('');
  protected readonly results = signal<PlaceSuggestion[]>([]);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly busy = signal(false);
  private readonly searchError = signal<string | null>(null);

  protected readonly listOpen = computed(() => this.open() && this.results().length > 0);
  protected readonly activeId = computed(() => (this.listOpen() && this.active() >= 0 ? this.optionId(this.active()) : null));
  protected readonly shownError = computed(() => this.searchError() ?? this.error());
  protected readonly showAttribution = computed(() => this.results().some((r) => r.source === 'google'));

  private token: unknown = null;
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['savedAddresses']) this.search.useSavedAddresses?.(this.savedAddresses());
    if (changes['value']) {
      const place = this.value();
      if (place && place.addressText !== this.text()) this.text.set(place.addressText);
    }
    const focus = changes['focusRequest'];
    if (focus && !focus.firstChange && this.focusRequest() > (focus.previousValue ?? 0)) this.focusInput();
  }

  ngAfterViewInit(): void {
    if (this.focusRequest() > 0) this.focusInput();
  }

  protected optionId(index: number): string {
    return `${this.listId}-option-${index}`;
  }

  protected onText(value: string): void {
    this.text.set(value);
    this.searchError.set(null);
    const place = this.value();
    if (place && value !== place.addressText) this.selectionCleared.emit();
    this.textChange.emit(value);
    this.clearTimer();
    this.sequence++;
    this.busy.set(false);
    if (value.trim().length < PLACE_MIN_CHARS) {
      if (value.trim() === '') this.showSaved();
      else this.close(true);
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runSearch(value);
    }, PLACE_DEBOUNCE_MS);
  }

  protected onFocusIn(): void {
    if (this.text().trim() === '') this.showSaved();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.contains(next)) return;
    this.close(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        if (!count) return;
        event.preventDefault();
        this.open.set(true);
        this.active.set((this.active() + 1) % count);
        return;
      case 'ArrowUp':
        if (!count) return;
        event.preventDefault();
        this.open.set(true);
        this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
        return;
      case 'Enter': {
        const option = this.listOpen() ? this.results()[this.active()] : undefined;
        if (!option) return;
        event.preventDefault();
        void this.pick(option);
        return;
      }
      case 'Escape':
        if (!this.listOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        this.close(false);
        return;
    }
  }

  protected async pick(option: PlaceSuggestion): Promise<void> {
    if (option.source === 'saved') {
      const saved = this.savedAddresses().find((a) => `saved:${a.id}` === option.placeId);
      const place: PlaceDetails | null = saved
        ? { addressText: saved.addressText, lat: saved.lat, lng: saved.lon, placeId: null }
        : await this.search.details(option.placeId, this.token).catch(() => null);
      if (place) this.select({ ...place, placeId: null });
      return;
    }
    try {
      const place = await this.search.details(option.placeId, this.ensureToken());
      this.token = this.search.newSessionToken();
      this.select(place);
    } catch {
      // Parity: nothing changes and the list stays.
    }
  }

  private select(place: PlaceDetails): void {
    this.sequence++;
    this.clearTimer();
    this.busy.set(false);
    this.text.set(place.addressText);
    this.close(true);
    this.placeSelected.emit(place);
    this.textChange.emit(place.addressText);
  }

  private async runSearch(query: string): Promise<void> {
    const sequence = ++this.sequence;
    this.busy.set(true);
    try {
      const found = await this.search.autocomplete(query, this.ensureToken());
      if (sequence !== this.sequence) return;
      this.results.set(found);
      this.active.set(-1);
      this.open.set(found.length > 0);
    } catch {
      if (sequence !== this.sequence) return;
      this.close(true);
      this.searchError.set(PLACE_SEARCH_FAILED);
    } finally {
      if (sequence === this.sequence) this.busy.set(false);
    }
  }

  private showSaved(): void {
    const saved = this.savedAddresses();
    if (!saved.length) {
      this.close(true);
      return;
    }
    this.results.set(
      saved.map((a) => ({ placeId: `saved:${a.id}`, primaryText: a.label, secondaryText: a.addressText, source: 'saved' })),
    );
    this.active.set(-1);
    this.open.set(true);
  }

  private close(clear: boolean): void {
    this.open.set(false);
    this.active.set(-1);
    if (clear) this.results.set([]);
  }

  private ensureToken(): unknown {
    this.token ??= this.search.newSessionToken();
    return this.token;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private focusInput(): void {
    const input = this.host.querySelector('input');
    input?.scrollIntoView?.({ block: 'center' });
    input?.focus();
  }
}
