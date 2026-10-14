import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type { RunnerPayoutItem } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { DrawerNavService } from '../drawer-nav.service';
import { formatKshExact } from '../shared-format';
import {
  runnerPayoutAmount,
  runnerPayoutChipStatus,
  runnerPayoutKindLabel,
} from './runner-payout-labels';

/** Ledger lines exist from CONFIRMED on, and for claims on CANCELLED / FAILED tasks (rows 104, 106). */
const WITH_LINES = new Set(['CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED']);

export function runnerPayoutsLinkApplies(status: string): boolean {
  return WITH_LINES.has(status);
}

/**
 * `Runner payouts` section of the task drawer (drawer-runner-payout SA-3):
 * one row per ledger line of the task (`GET /runner-payouts?errandId=`),
 * amount and chip; a row opens the runner payout drawer. Hidden without lines.
 */
@Component({
  selector: 'app-runner-payouts-link-section',
  imports: [StatusChipComponent],
  template: `
    @if (failed()) {
      <section class="drawer-section">
        <div class="drawer-label">Runner payouts</div>
        <div class="drawer-caption">
          Couldn't load runner payouts.
          <button type="button" class="btn btn-text btn-sm" (click)="retry()">Try again</button>
        </div>
      </section>
    } @else if (items().length) {
      <section class="drawer-section">
        <div class="drawer-label">Runner payouts</div>
        <div class="drawer-card">
          @for (l of items(); track l.id) {
            <div
              class="drawer-row clickable"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Open ' + kindLabel(l.kind)"
              (click)="open(l.id)"
              (keydown.enter)="open(l.id)"
            >
              <span>{{ kindLabel(l.kind) }}</span>
              <span class="row-inline">
                <app-status-chip [status]="chipStatus(l)" kind="runner_payout" />
                <b>{{ formatKshExact(amount(l).value) }}</b>
              </span>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [],
})
export class RunnerPayoutsLinkSectionComponent {
  private readonly api = inject(ApiService);
  private readonly nav = inject(DrawerNavService);

  readonly errandId = input.required<string>();
  readonly status = input.required<string>();

  protected readonly items = signal<RunnerPayoutItem[]>([]);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const id = this.errandId();
      const applies = runnerPayoutsLinkApplies(this.status());
      untracked(() => {
        this.items.set([]);
        this.failed.set(false);
        if (applies) void this.load(id);
      });
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const page = await firstValueFrom(this.api.listRunnerPayouts({ errandId: id }, null, 25));
      if (id === this.errandId()) this.items.set(page.items);
    } catch {
      if (id === this.errandId()) this.failed.set(true);
    }
  }

  protected retry(): void {
    this.failed.set(false);
    void this.load(this.errandId());
  }

  protected open(id: string): void {
    this.nav.open('runner_payout', id);
  }

  protected readonly kindLabel = runnerPayoutKindLabel;
  protected readonly chipStatus = runnerPayoutChipStatus;
  protected readonly amount = runnerPayoutAmount;
  protected readonly formatKshExact = formatKshExact;
}
