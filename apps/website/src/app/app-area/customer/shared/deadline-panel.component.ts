// DeadlinePanelComponent (#8 XQ §States "Deadline panel"; app
// `showDeadlineSheet`, deadline_sheet.dart). Hosted by `NmPanelService`
// (bottom sheet below 768px, centred above, WQ-3). `Today`, `Tomorrow` and
// `Flexible` (#7's chip group); `Today` hidden once 23:59 EAT of today's
// EAT date has passed. Choosing a chip saves at once: `PATCH /errands/:id
// { deadlineAt }` with 23:59 EAT of that EAT date as UTC ISO, or null (owner
// WQ-2: the browser zone never changes the value). The captions are #7's
// (`Due today, 23:59 EAT.`, WQ-53). Closes with `saved`, `not-editable` or
// nothing (the current chip chosen again).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { formatHours } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { NmChoiceChipGroup, NmChoiceOption } from '../../../shared/ui/choice-chip/choice-chip-group.component';
import { NmNotice } from '../../../shared/ui/notice/notice.component';
import { NM_OVERLAY_DATA, NmOverlayRef } from '../../../shared/ui/overlay/overlay-ref';
import { NmPulsingDots } from '../../../shared/ui/pulsing-dots/pulsing-dots.component';
import { CUSTOMER_NOW } from '../clock';
import { CheckoutApi } from '../data/checkout.api';
import { CustomerErrandsApi, ErrandDefaults, apiErrorOf } from '../data/errands.api';
import { DeadlineChoice, deadlineAt, deadlineChoiceOf } from '../deadline';

export interface DeadlinePanelData {
  readonly errandId: string;
  /** The errand's saved deadline. */
  readonly deadlineAt: string | null;
}

export type DeadlinePanelResult = 'saved' | 'not-editable';

export const DEADLINE_PANEL_ERROR = "Couldn't change the deadline. Try again.";

const OPTIONS: readonly NmChoiceOption<DeadlineChoice>[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'flexible', label: 'Flexible' },
];

@Component({
  selector: 'app-deadline-panel',
  imports: [NmChoiceChipGroup, NmNum, NmNotice, NmPulsingDots],
  template: `
    <div class="deadline-panel">
      <div class="deadline-panel__chips" (click)="onClick($event)">
        <nm-choice-chip-group
          [options]="options()"
          [selected]="selected()"
          [disabled]="saving()"
          ariaLabel="Deadline"
          (selectedChange)="choose($event)"
        />
      </div>
      @if (selected() === 'today') {
        <p class="deadline-panel__caption">Due today, <span nmNum>23:59</span> EAT.</p>
      } @else if (selected() === 'tomorrow') {
        <p class="deadline-panel__caption">Due tomorrow, <span nmNum>23:59</span> EAT.</p>
      } @else if (selected() === 'flexible' && flexibleDuration(); as duration) {
        <p class="deadline-panel__caption">
          No fixed time. Your task's deadline is <span nmNum>{{ duration }}</span> after your payment is confirmed.
        </p>
      }
      @if (saving()) {
        <nm-pulsing-dots class="deadline-panel__saving" label="Saving" />
      }
      @if (error()) {
        <div class="deadline-panel__error" role="alert"><nm-notice tone="danger">{{ errorCopy }}</nm-notice></div>
      }
    </div>
  `,
  styleUrl: './deadline-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeadlinePanelComponent {
  private readonly data = inject(NM_OVERLAY_DATA) as DeadlinePanelData;
  private readonly ref = inject(NmOverlayRef) as NmOverlayRef<DeadlinePanelResult>;
  private readonly api = inject(CheckoutApi);
  private readonly now = inject(CUSTOMER_NOW);

  protected readonly errorCopy = DEADLINE_PANEL_ERROR;
  private readonly openedAt = this.now();
  private readonly current = deadlineChoiceOf(this.data.deadlineAt, this.openedAt);

  /** `Today` only until 23:59 EAT of today's EAT date. */
  protected readonly options = signal(
    OPTIONS.filter((o) => o.value !== 'today' || this.openedAt.getTime() < new Date(deadlineAt('today', this.openedAt) as string).getTime()),
  );
  protected readonly selected = signal<DeadlineChoice | null>(this.current);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  private readonly defaults = signal<ErrandDefaults | null>(null);

  protected readonly flexibleDuration = computed(() => {
    const d = this.defaults();
    if (!d || d.defaultDeadlineStartsAt !== 'payment_confirmed' || !(d.defaultDeadlineHours > 0)) return null;
    return formatHours(d.defaultDeadlineHours * 3600);
  });

  constructor() {
    inject(CustomerErrandsApi)
      .defaults()
      .then((d) => this.defaults.set(d))
      .catch(() => this.defaults.set(null));
  }

  /** The already-current chip chosen again: just close (the group emits nothing for it). */
  protected onClick(event: MouseEvent): void {
    if (this.saving()) return;
    const chip = (event.target as HTMLElement | null)?.closest('[role="radio"]');
    if (chip && chip.getAttribute('aria-checked') === 'true' && this.selected() === this.current) this.ref.close(undefined);
  }

  protected async choose(value: string): Promise<void> {
    const choice = OPTIONS.find((o) => o.value === value)?.value;
    if (!choice || this.saving()) return;
    if (choice === this.current) {
      this.ref.close(undefined);
      return;
    }
    this.selected.set(choice);
    this.saving.set(true);
    this.error.set(false);
    try {
      await this.api.setDeadline(this.data.errandId, deadlineAt(choice, this.now()));
      this.ref.close('saved');
    } catch (err) {
      if (apiErrorOf(err).code === 'deadline_not_editable') {
        this.ref.close('not-editable');
        return;
      }
      this.saving.set(false);
      this.error.set(true);
    }
  }
}
