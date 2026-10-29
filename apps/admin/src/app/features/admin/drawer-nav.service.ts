import { Injectable, signal } from '@angular/core';

export type DrawerKind =
  | 'task'
  | 'runner'
  | 'dispute'
  | 'refund'
  | 'runner_payout'
  /** Verification documents (row 278); id = runner profile id. */
  | 'runner_verification'
  /** Customer account (issue #24, SQ-3); id = the customer's user id. */
  | 'customer';

export interface DrawerTarget {
  kind: DrawerKind;
  id: string;
}

/**
 * Asked before the open drawer closes or switches. Return true to allow it
 * now; return false to veto and call `proceed` later (e.g. after the
 * drawer's own A-08 "Discard?" prompt).
 */
export type CloseGuard = (proceed: () => void) => boolean;

/**
 * The shell's single drawer (A-01) as shared state, so a drawer can switch
 * to another one (task → refund review, refund → task, dispute → refund)
 * without importing the shell. A drawer with unsaved input registers a
 * close guard.
 */
@Injectable({ providedIn: 'root' })
export class DrawerNavService {
  readonly current = signal<DrawerTarget | null>(null);
  /**
   * A runner whose payout lines should be shown (`View payouts` on the runner
   * drawer): the shell switches to the Runner payouts panel, which applies
   * the filter and clears it.
   */
  readonly runnerPayoutsFor = signal<string | null>(null);
  private guard: CloseGuard | null = null;

  open(kind: DrawerKind, id: string): void {
    this.leave(() => this.set({ kind, id }));
  }

  /** Close unless the open drawer's guard vetoes (it then resumes the close). */
  requestClose(then?: () => void): void {
    this.leave(() => {
      this.set(null);
      then?.();
    });
  }

  setCloseGuard(guard: CloseGuard | null): void {
    this.guard = guard;
  }

  private leave(action: () => void): void {
    const guard = this.guard;
    if (!guard || guard(action)) action();
  }

  private set(target: DrawerTarget | null): void {
    this.guard = null;
    this.current.set(target);
  }
}
