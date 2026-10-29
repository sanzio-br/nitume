// Handle to an open dialog or panel (ui-kit spec §4.8, §4.9).
import { InjectionToken, signal } from '@angular/core';

export class NmOverlayRef<R = unknown> {
  private resolveClosed!: (result: R | undefined) => void;
  private done = false;
  /** Teardown installed by the overlay host. */
  onDispose: (() => void) | null = null;

  /** Resolves once with the close result (`undefined` on dismiss). */
  readonly closed: Promise<R | undefined> = new Promise((resolve) => {
    this.resolveClosed = resolve;
  });

  /** Optional `error` line under the dialog actions (`role="alert"`). */
  readonly error = signal<string | null>(null);

  get isOpen(): boolean {
    return !this.done;
  }

  close(result?: R): void {
    if (this.done) return;
    this.done = true;
    this.onDispose?.();
    this.resolveClosed(result);
  }

  setError(message: string | null): void {
    this.error.set(message);
  }
}

/** Data passed through `config.data` to projected content. */
export const NM_OVERLAY_DATA = new InjectionToken<unknown>('NM_OVERLAY_DATA');
