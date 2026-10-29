// customer `v-new-details` (customer-v-new-details.md): wizard step 2.
// Per-category cards, validation shown after the first `Continue →` and
// then live, Places through PLACE_SEARCH (WQ-25, WQ-26), deadline chips
// with the Flexible caption from `GET /errands/defaults`, the budget (Buy
// and Get only) and the Buy For Me shopping list. Nothing is posted here.
// `<form novalidate>` without the forms module (§W10).
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { formatHours } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { MAPS_API_KEY } from '../../../shared/map/maps-loader.service';
import { PlaceDetails, SavedPlace } from '../../../shared/places/place-search';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmCard } from '../../../shared/ui/card/card.component';
import { NmChoiceChipGroup, NmChoiceOption } from '../../../shared/ui/choice-chip/choice-chip-group.component';
import { NmField } from '../../../shared/ui/field/field.component';
import { NmFieldValue } from '../../../shared/ui/field/field-value.directive';
import { NmFormCard } from '../../../shared/ui/field/form-card.component';
import { NmNotice } from '../../../shared/ui/notice/notice.component';
import { NmPlaceField } from '../../../shared/ui/place-field/place-field.component';
import { NmShoppingItem, NmShoppingList } from '../../../shared/ui/shopping-list/shopping-list.component';
import { NmWizardFrame } from '../../../shared/ui/wizard-frame/wizard-frame.component';
import { customerLinks } from '../customer-links';
import { CustomerAddressesApi } from '../data/addresses.api';
import { CustomerErrandsApi, ErrandDefaults } from '../data/errands.api';
import { DeadlineChoice, TaskDraftStore } from './task-draft.store';

export const DETAILS_COPY = {
  titleHeading: 'Task title (optional)',
  titlePlaceholder: 'e.g. Apartment check — Nyali',
  descriptionHeading: 'Describe the task',
  descriptionPlaceholder: 'e.g. Check the apartment in Nyali — video the compound, both bedrooms and bathroom.',
  locationHeading: 'Location',
  pickupLabel: 'Pick up from',
  buyFromLabel: 'Buy from',
  dropoffLabel: 'Deliver to',
  listHeading: 'Shopping list',
  deadlineHeading: 'Deadline',
  budgetHeading: 'Budget (if a purchase is involved)',
  noKeyNotice: "Place search isn't available yet. Choose one of your saved addresses that has a map location.",
} as const;

export const DETAILS_ERRORS = {
  titleLong: 'Keep the title under 60 characters.',
  titleShort: 'Use at least 3 characters, or leave it empty.',
  description: 'Tell the runner a bit more (at least 5 characters).',
  pickFromList: 'Choose a place from the list.',
  location: 'Choose a location.',
  pickup: 'Choose where to pick up.',
  buyFrom: 'Choose where to buy.',
  dropoff: 'Choose where to deliver.',
  items: 'Add at least one item.',
  budgetMax: 'Enter an amount up to KSh 1,000,000.',
  budgetRequired: 'Enter a budget for the items.',
} as const;

export const BUDGET_MAX = 1_000_000;

const DEADLINES: readonly NmChoiceOption<DeadlineChoice>[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'flexible', label: 'Flexible' },
];

type FieldKey = 'title' | 'description' | 'first' | 'dropoff' | 'items' | 'budget';
/** First-error order. */
const FIELD_ORDER: readonly FieldKey[] = ['title', 'description', 'first', 'dropoff', 'items', 'budget'];
type Errors = Partial<Record<FieldKey, string>>;

@Component({
  selector: 'app-new-details-page',
  imports: [
    NmWizardFrame,
    NmFormCard,
    NmCard,
    NmField,
    NmFieldValue,
    NmPlaceField,
    NmNotice,
    NmShoppingList,
    NmChoiceChipGroup,
    NmButton,
    NmNum,
  ],
  templateUrl: './new-details.page.html',
  styleUrl: './new-details.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewDetailsPage implements AfterViewInit {
  protected readonly store = inject(TaskDraftStore);
  private readonly router = inject(Router);
  private readonly errandsApi = inject(CustomerErrandsApi);
  private readonly addressesApi = inject(CustomerAddressesApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly copy = DETAILS_COPY;
  protected readonly deadlines = DEADLINES;
  protected readonly stepOne = customerLinks.newTask();
  protected readonly noKey = !inject(MAPS_API_KEY);
  protected readonly unloadGuard = () => this.store.hasData() && !this.store.submitted;

  protected readonly saved = signal<SavedPlace[]>([]);
  private readonly defaults = signal<ErrandDefaults | null>(null);
  /** Text typed in each place field (a pick is only valid while it matches). */
  private readonly firstText = signal(this.store.first()?.addressText ?? '');
  private readonly dropoffText = signal(this.store.dropoff()?.addressText ?? '');
  /** Errors show after the first `Continue →`, then live. */
  private readonly attempted = signal(false);

  protected readonly firstLabel = computed(() => {
    const c = this.store.category();
    return c === 'buy_for_me' ? DETAILS_COPY.buyFromLabel : c === 'pickup_delivery' ? DETAILS_COPY.pickupLabel : null;
  });
  protected readonly budgetText = computed(() => {
    const b = this.store.budget();
    return b === null ? '' : String(b);
  });
  /** `{duration}` of the Flexible caption, or null (hidden). */
  protected readonly flexibleDuration = computed(() => {
    const d = this.defaults();
    if (this.store.deadline() !== 'flexible' || !d) return null;
    if (d.defaultDeadlineStartsAt !== 'payment_confirmed' || !(d.defaultDeadlineHours > 0)) return null;
    return formatHours(d.defaultDeadlineHours * 3600);
  });

  private readonly allErrors = computed<Errors>(() => {
    const s = this.store;
    const out: Errors = {};
    const title = s.title().trim();
    if (title.length > 60) out.title = DETAILS_ERRORS.titleLong;
    else if (title.length > 0 && title.length < 3) out.title = DETAILS_ERRORS.titleShort;
    if (s.description().trim().length < 5) out.description = DETAILS_ERRORS.description;
    if (!s.first()) {
      out.first = this.firstText().trim()
        ? DETAILS_ERRORS.pickFromList
        : s.isBuy()
          ? DETAILS_ERRORS.buyFrom
          : s.twoPoints()
            ? DETAILS_ERRORS.pickup
            : DETAILS_ERRORS.location;
    }
    if (s.twoPoints() && !s.dropoff()) {
      out.dropoff = this.dropoffText().trim() ? DETAILS_ERRORS.pickFromList : DETAILS_ERRORS.dropoff;
    }
    if (s.isBuy() && s.namedItems().length === 0) out.items = DETAILS_ERRORS.items;
    if (s.hasBudget()) {
      const b = s.budget();
      if (b !== null && b > BUDGET_MAX) out.budget = DETAILS_ERRORS.budgetMax;
      else if (s.isBuy() && !b) out.budget = DETAILS_ERRORS.budgetRequired;
    }
    return out;
  });
  protected readonly errors = computed<Errors>(() => (this.attempted() ? this.allErrors() : {}));

  constructor() {
    // Background loads; failures are silent (no shortcuts / no caption).
    this.addressesApi
      .list()
      .then((list) =>
        this.saved.set(
          (Array.isArray(list) ? list : [])
            .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
            .map((a) => ({ id: a.id, label: a.label, addressText: a.addressText, lat: a.lat as number, lon: a.lon as number })),
        ),
      )
      .catch(() => undefined);
    this.errandsApi
      .defaults()
      .then((d) => this.defaults.set(d))
      .catch(() => undefined);
  }

  /** `Change location` on step 3: focus the refused field (#6 rule: before the heading focus). */
  ngAfterViewInit(): void {
    const target = this.store.focusOnReturn;
    if (!target) return;
    this.store.focusOnReturn = null;
    this.focusField(target === 'dropoff' && this.store.twoPoints() ? 'dropoff' : 'first');
  }

  protected onFirstPicked(place: PlaceDetails): void {
    this.store.first.set(place);
  }

  protected onDropoffPicked(place: PlaceDetails): void {
    this.store.dropoff.set(place);
  }

  protected onFirstText(text: string): void {
    this.firstText.set(text);
  }

  protected onDropoffText(text: string): void {
    this.dropoffText.set(text);
  }

  protected onItems(items: NmShoppingItem[]): void {
    this.store.items.set(items);
  }

  protected onDeadline(value: string): void {
    if (value === 'today' || value === 'tomorrow' || value === 'flexible') this.store.deadline.set(value);
  }

  protected onBudget(text: string): void {
    this.store.budget.set(text === '' ? null : Number(text));
  }

  protected continue(): void {
    this.attempted.set(true);
    const errors = this.allErrors();
    const first = FIELD_ORDER.find((key) => errors[key]);
    if (first) {
      this.focusField(first);
      return;
    }
    this.store.detailsValidated = true;
    void this.router.navigateByUrl(customerLinks.newTaskReview());
  }

  private focusField(key: FieldKey): void {
    const control = this.host.querySelector<HTMLElement>(`[data-field="${key}"] input, [data-field="${key}"] textarea`);
    control?.scrollIntoView?.({ block: 'center' });
    control?.focus();
  }
}
