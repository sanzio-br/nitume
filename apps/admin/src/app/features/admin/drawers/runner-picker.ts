import { Component, computed, input, output, signal } from '@angular/core';
import type { ErrandCandidate } from '../../../core/api-types';
import { NumTextComponent } from '../../../shared/num-text.component';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { runnerName } from '../payouts/runner-payout-labels';

let nextId = 0;

/** A candidate the admin may pick: not tried and within the purchase limit (rows 178, 186). */
export function isPickable(c: ErrandCandidate): boolean {
  return !c.tried && !c.ineligibleReason;
}

export function candidateName(c: ErrandCandidate): string {
  return runnerName({ displayName: c.displayName, shortName: null }, c.runnerProfileId);
}

/** `4.9 · 137 tasks · 2.4 km` (numbers render in Fira Code). */
export function candidateCaption(c: ErrandCandidate): string {
  const parts = [
    Number(c.rating).toFixed(1),
    `${c.tasksCompleted} task${c.tasksCompleted === 1 ? '' : 's'}`,
  ];
  if (c.distanceKm !== null) parts.push(`${c.distanceKm.toFixed(1)} km`);
  return parts.join(' · ');
}

/**
 * Runner list of the assign dialog (drawer-task-offer, rows 215, 228):
 * online runners from `GET /errands/:id/candidates` as a radio list, then a
 * collapsed, selectable `Show offline runners ({n})` group. Offline runners
 * carry an `Offline` chip; picking one shows that they accept once online.
 */
@Component({
  selector: 'app-runner-picker',
  imports: [NumTextComponent, StatusChipComponent],
  template: `
    <div class="runner-pick-list" role="radiogroup" aria-label="Runner">
      @for (c of online(); track c.runnerProfileId) {
        <label class="runner-pick">
          <input
            type="radio"
            [name]="name"
            [value]="c.runnerProfileId"
            [checked]="selected() === c.runnerProfileId"
            (change)="selectedChange.emit(c.runnerProfileId)"
          />
          <span class="runner-pick-main">
            <span class="runner-pick-name">{{ candidateName(c) }}</span>
            <span class="runner-pick-sub"><app-num-text [text]="candidateCaption(c)" /></span>
          </span>
        </label>
      } @empty {
        <div class="drawer-caption">No eligible runners are available right now.</div>
      }
    </div>
    @if (offline().length) {
      <button
        type="button"
        class="btn btn-text btn-sm runner-pick-toggle"
        [attr.aria-expanded]="showOffline()"
        [attr.aria-controls]="offlineId"
        (click)="showOffline.set(!showOffline())"
      >
        Show offline runners (<span class="num">{{ offlineCount() }}</span
        >)
      </button>
      @if (showOffline()) {
        <div
          class="runner-pick-list"
          role="radiogroup"
          aria-label="Offline runners"
          [id]="offlineId"
        >
          @for (c of offline(); track c.runnerProfileId) {
            <label class="runner-pick">
              <input
                type="radio"
                [name]="name"
                [value]="c.runnerProfileId"
                [checked]="selected() === c.runnerProfileId"
                [attr.aria-label]="candidateName(c) + ', offline'"
                (change)="selectedChange.emit(c.runnerProfileId)"
              />
              <span class="runner-pick-main">
                <span class="runner-pick-name">{{ candidateName(c) }}</span>
                <span class="runner-pick-sub"><app-num-text [text]="candidateCaption(c)" /></span>
              </span>
              <app-status-chip label="Offline" tone="info" />
            </label>
          }
        </div>
      }
    }
    @if (selectedOffline(); as c) {
      <div class="drawer-caption" role="status">
        {{ candidateName(c) }} is offline. They can accept once they go online.
      </div>
    }
  `,
  styles: [':host { display: block; }'],
})
export class RunnerPickerComponent {
  readonly candidates = input<ErrandCandidate[]>([]);
  /** `offlineCount` from the API (all pages). */
  readonly offlineCount = input(0);
  readonly selected = input('');
  readonly selectedChange = output<string>();

  private readonly uid = ++nextId;
  protected readonly name = `runner-pick-${this.uid}`;
  protected readonly offlineId = `runner-pick-${this.uid}-offline`;
  protected readonly showOffline = signal(false);

  protected readonly online = computed(() =>
    this.candidates().filter((c) => !c.offline && isPickable(c)),
  );
  protected readonly offline = computed(() =>
    this.candidates().filter((c) => c.offline && isPickable(c)),
  );
  protected readonly selectedOffline = computed(
    () => this.offline().find((c) => c.runnerProfileId === this.selected()) ?? null,
  );

  protected readonly candidateName = candidateName;
  protected readonly candidateCaption = candidateCaption;
}
