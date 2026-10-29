// TaskDraftStore (customer-v-new-category §W2; port of TaskDraft). Provided
// once by the `new` parent route, so the draft survives moving between the
// three steps. Signals only, memory only: a reload loses the draft, as
// killing the app does.
import { Injectable, computed, signal } from '@angular/core';
import type { PlaceDetails } from '../../../shared/places/place-search';
import type { CreatableCategory, CreateErrandBody, PointType } from '../data/errands.api';
import { customerLinks } from '../customer-links';
import { DeadlineChoice, deadlineAt } from '../deadline';

// Moved to `app-area/customer/deadline.ts` (#8 A§8); re-exported here.
export { deadlineAt };
export type { DeadlineChoice };

export type WizardCategory = CreatableCategory;
/** `placeId` is null for a saved address. */
export type DraftPlace = PlaceDetails;

export interface DraftItem {
  readonly name: string;
  /** 1..99 */
  readonly quantity: number;
}

export interface OutsideArea {
  readonly first: DraftPlace | null;
  readonly dropoff: DraftPlace | null;
  readonly pointType: PointType | null;
}

/** The five customer categories (never `business`, OA-18). */
export const WIZARD_CATEGORIES: readonly WizardCategory[] = [
  'buy_for_me',
  'pickup_delivery',
  'inspection',
  'representation',
  'queue_admin',
];

export function isWizardCategory(value: unknown): value is WizardCategory {
  return typeof value === 'string' && (WIZARD_CATEGORIES as readonly string[]).includes(value);
}

const TWO_POINTS: readonly WizardCategory[] = ['pickup_delivery', 'buy_for_me'];
const emptyItems = (): DraftItem[] => [{ name: '', quantity: 1 }];

@Injectable()
export class TaskDraftStore {
  readonly category = signal<WizardCategory | null>(null);
  readonly title = signal('');
  readonly description = signal('');
  /** Task site (Check / Go There / Wait) or pickup / store (Get / Buy). */
  readonly first = signal<DraftPlace | null>(null);
  /** Get It For Me, Buy For Me. */
  readonly dropoff = signal<DraftPlace | null>(null);
  readonly items = signal<DraftItem[]>(emptyItems());
  readonly deadline = signal<DeadlineChoice>('today');
  /** Whole shillings; null = empty. */
  readonly budget = signal<number | null>(null);
  /** Set once `POST /errands` succeeded (a retry submits only). */
  createdErrandId: string | null = null;
  submitted = false;
  /** The review step's request is in flight (leave guard, Back disabled). */
  readonly submitting = signal(false);
  /** Step 2 passed validation once (step-3 guard). */
  detailsValidated = false;
  readonly outsideArea = signal<OutsideArea | null>(null);
  /** The URL that opened the wizard. */
  openerUrl = customerLinks.home();
  /** Set by `Change location` on the review step. */
  focusOnReturn: 'first' | 'dropoff' | null = null;

  readonly twoPoints = computed(() => {
    const c = this.category();
    return c !== null && TWO_POINTS.includes(c);
  });
  readonly isBuy = computed(() => this.category() === 'buy_for_me');
  /** Row 45: only Buy For Me and Get It For Me have a budget field. */
  readonly hasBudget = computed(() => this.twoPoints());
  readonly namedItems = computed(() => this.items().filter((i) => i.name.trim() !== ''));
  readonly hasData = computed(
    () =>
      this.title().trim() !== '' ||
      this.description().trim() !== '' ||
      this.first() !== null ||
      this.dropoff() !== null ||
      this.namedItems().length > 0 ||
      (this.budget() ?? 0) > 0,
  );
  /** True while both places are the very objects the API refused. */
  readonly locationRefused = computed(() => {
    const refused = this.outsideArea();
    return refused !== null && refused.first === this.first() && refused.dropoff === this.dropoff();
  });

  /** A fresh draft (also clears `submitted`). */
  start(openerUrl: string, category: WizardCategory | null): void {
    this.clear();
    this.submitted = false;
    this.openerUrl = openerUrl;
    this.category.set(category);
  }

  /** Flutter rules: keep the title and description; places, items and budget as the new category needs. */
  changeCategory(next: WizardCategory): void {
    if (this.category() === next) return;
    const hadTwo = this.twoPoints();
    this.category.set(next);
    if (this.twoPoints() !== hadTwo) this.first.set(null);
    this.dropoff.set(null);
    this.items.set(emptyItems());
    if (!this.hasBudget()) this.budget.set(null);
  }

  /** Discard: an empty draft, `submitted` false. */
  reset(): void {
    this.clear();
    this.submitted = false;
  }

  /** After a successful submit: an empty draft; `submitted` and `openerUrl` stay until the next `start()`. */
  finish(): void {
    this.clear();
    this.submitted = true;
  }

  /** `POST /errands` body (ND§Data). Never `urgency`; the wire key is `lon`. */
  toRequest(now: Date): CreateErrandBody {
    const category = this.category();
    if (!category) throw new Error('No category');
    const place = (pointType: PointType, p: DraftPlace | null) => {
      if (!p) throw new Error(`No ${pointType}`);
      return {
        pointType,
        lat: p.lat,
        lon: p.lng,
        addressText: p.addressText,
        ...(p.placeId ? { placeId: p.placeId } : {}),
      };
    };
    const body: CreateErrandBody = {
      category,
      description: this.description().trim(),
      budget: this.hasBudget() ? (this.budget() ?? 0) : 0,
      locations: this.twoPoints()
        ? [place('pickup', this.first()), place('dropoff', this.dropoff())]
        : [place('task_site', this.first())],
    };
    const title = this.title().trim();
    if (title) body.title = title;
    const deadline = deadlineAt(this.deadline(), now);
    if (deadline) body.deadlineAt = deadline;
    if (this.isBuy()) body.items = this.namedItems().map((i) => ({ name: i.name.trim(), quantity: i.quantity }));
    return body;
  }

  private clear(): void {
    this.category.set(null);
    this.title.set('');
    this.description.set('');
    this.first.set(null);
    this.dropoff.set(null);
    this.items.set(emptyItems());
    this.deadline.set('today');
    this.budget.set(null);
    this.createdErrandId = null;
    this.submitting.set(false);
    this.detailsValidated = false;
    this.outsideArea.set(null);
    this.focusOnReturn = null;
  }
}
