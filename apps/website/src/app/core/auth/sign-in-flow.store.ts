// SignInFlowStore (auth-foundation §6.6): memory only. Set by the phone
// screen, read by the code screen, kept on Back, cleared after sign-in,
// lost on reload (otpStepGuard then sends the visitor to the phone screen).
import { Injectable, signal } from '@angular/core';
import type { AppRole } from './auth.tokens';

export interface SignInFlow {
  /** Normalised `+2547…` / `+2541…`. */
  readonly phone: string;
  /** Epoch ms when Resend becomes available. */
  readonly cooldownEndsAt: number;
}

@Injectable({ providedIn: 'root' })
export class SignInFlowStore {
  private readonly flows = signal<Readonly<Record<AppRole, SignInFlow | null>>>({
    customer: null,
    runner: null,
  });

  get(role: AppRole): SignInFlow | null {
    return this.flows()[role];
  }

  set(role: AppRole, flow: SignInFlow): void {
    this.flows.update((all) => ({ ...all, [role]: flow }));
  }

  /** Restarts the resend cooldown for the stored phone. */
  setCooldown(role: AppRole, cooldownEndsAt: number): void {
    const current = this.get(role);
    if (current) this.set(role, { ...current, cooldownEndsAt });
  }

  clear(role: AppRole): void {
    this.flows.update((all) => ({ ...all, [role]: null }));
  }
}
