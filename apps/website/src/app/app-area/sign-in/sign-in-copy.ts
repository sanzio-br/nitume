// Per-role copy of the #6 views (customer and runner view specs).
import type { AppRole } from '../../core/auth/auth.tokens';

export interface PhoneCopy {
  readonly heading: string;
  readonly sub: string;
  readonly termsLabel: string;
}

export const PHONE_COPY: Readonly<Record<AppRole, PhoneCopy>> = {
  customer: {
    heading: "Someone there, when you can't be.",
    sub: 'Enter your phone number to sign in or create an account.',
    termsLabel: 'Terms',
  },
  runner: {
    heading: 'Earn on your own schedule.',
    sub: 'Enter your phone number to sign in or apply as a Runner.',
    termsLabel: 'Runner Terms',
  },
};

export interface NameCopy {
  readonly heading: string;
  readonly sub: string;
  readonly label: string;
  readonly placeholder: string;
}

export const NAME_COPY: Readonly<Record<AppRole, NameCopy>> = {
  customer: {
    heading: 'What should we call you?',
    sub: 'Your runner sees this name on your tasks.',
    label: 'Your name',
    placeholder: 'e.g. Achieng Otieno',
  },
  runner: {
    heading: "What's your name?",
    sub: 'Use the name on your National ID. Customers see your first name and initial.',
    label: 'Your full name',
    placeholder: 'e.g. Brian Kamau',
  },
};

export const NAME_REQUIRED_COPY = 'Enter your name.';
export const NAME_TOO_LONG_COPY = 'Keep it under 60 characters.';
export const NAME_SAVE_FAILED_COPY = "Couldn't save your name. Try again.";

/** `Runner` wordmark suffix in the runner area (R-17). */
export function wordmarkSuffix(role: AppRole): string | null {
  return role === 'runner' ? 'Runner' : null;
}
