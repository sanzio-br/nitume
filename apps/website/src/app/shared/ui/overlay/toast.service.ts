// `NmToastService` (ui-kit spec §4.10; Flutter showSnack + snackBarTheme).
// One toast at a time; auto-dismiss after 4 s; hover/focus pauses.
import { Injectable, TemplateRef, signal } from '@angular/core';

export interface NmToast {
  readonly id: number;
  readonly message: string | TemplateRef<unknown>;
  /** Extra bottom offset (px) above a fixed bottom CTA. */
  readonly offset: number;
}

export const NM_TOAST_DURATION_MS = 4000;

@Injectable({ providedIn: 'root' })
export class NmToastService {
  private readonly currentToast = signal<NmToast | null>(null);
  readonly current = this.currentToast.asReadonly();

  private nextId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;
  private remaining = 0;
  private paused = false;

  /** Replaces any visible toast. Wrap numeric parts with `nmNum` in a template. */
  show(message: string | TemplateRef<unknown>, opts: { offset?: number } = {}): void {
    this.clearTimer();
    this.paused = false;
    this.currentToast.set({ id: this.nextId++, message, offset: opts.offset ?? 0 });
    this.start(NM_TOAST_DURATION_MS);
  }

  dismiss(): void {
    this.clearTimer();
    this.paused = false;
    this.currentToast.set(null);
  }

  /** Hover or focus on the toast. */
  pause(): void {
    if (this.paused || !this.timer) return;
    this.paused = true;
    this.remaining = Math.max(0, this.deadline - Date.now());
    this.clearTimer();
  }

  resume(): void {
    if (!this.paused || !this.currentToast()) return;
    this.paused = false;
    this.start(this.remaining);
  }

  private start(ms: number): void {
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.currentToast.set(null);
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
