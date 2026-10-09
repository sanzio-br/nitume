import { Component, OnDestroy, OnInit, computed, input, output, signal } from '@angular/core';
import type { ChipVariant } from './status-chip.component';

export type NoticeTone = 'success' | 'danger' | 'info';

const CHIP: Record<NoticeTone, { label: string; variant: ChipVariant }> = {
  success: { label: 'Done', variant: 'success' },
  danger: { label: 'Problem', variant: 'danger' },
  info: { label: 'Note', variant: 'info' },
};

/**
 * Inline notice (A-11): a `.drawer-card` with a chip of the tone, then 13px
 * blue text. Amber/red stay at chip size (design system): no filled banners.
 * `role="alert"` for danger, `role="status"` otherwise. Optional dismiss,
 * auto-dismiss and a projected `[notice-action]` (e.g. `Try again`).
 */
@Component({
  selector: 'app-inline-notice',
  imports: [],
  template: `
    @if (!hidden()) {
      <div class="drawer-card notice" [attr.role]="tone() === 'danger' ? 'alert' : 'status'">
        <div class="notice-main">
          <span class="chip" [class]="'chip-' + chip().variant"
            ><span class="dot"></span>{{ chip().label }}</span
          >
          <div class="notice-text"><ng-content /></div>
          @if (dismissible()) {
            <button type="button" class="notice-close" aria-label="Dismiss" (click)="dismiss()">
              ✕
            </button>
          }
        </div>
        <div class="notice-action"><ng-content select="[notice-action]" /></div>
      </div>
    }
  `,
  styles: [':host { display: block; }'],
})
export class InlineNoticeComponent implements OnInit, OnDestroy {
  readonly tone = input<NoticeTone>('info');
  readonly dismissible = input(false);
  /** Auto-dismiss after this many ms (0 = never). Spec default for success: 6000. */
  readonly autoDismissMs = input(0);

  readonly dismissed = output<void>();

  protected readonly hidden = signal(false);
  protected readonly chip = computed(() => CHIP[this.tone()]);
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (this.autoDismissMs() > 0) {
      this.timer = setTimeout(() => this.dismiss(), this.autoDismissMs());
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  dismiss(): void {
    this.hidden.set(true);
    this.dismissed.emit();
  }
}
