import { Component, computed, input } from '@angular/core';

export type ChipVariant = 'success' | 'info' | 'pending' | 'danger' | 'neutral';

const ERRAND_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  REQUESTED: 'Awaiting quote',
  QUOTED: 'Quoted',
  ACCEPTED: 'Accepted',
  PAYMENT_CONFIRMED: 'Paid',
  RUNNER_ASSIGNED: 'Assigned',
  RUNNER_EN_ROUTE: 'En route',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In progress',
  AWAITING_CUSTOMER: 'Awaiting customer',
  COMPLETED: 'Completed',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
  DISPUTED: 'Disputed',
  EXPIRED: 'Expired',
};

const ERRAND_VARIANTS: Record<string, ChipVariant> = {
  DRAFT: 'neutral',
  REQUESTED: 'pending',
  QUOTED: 'pending',
  ACCEPTED: 'info',
  PAYMENT_CONFIRMED: 'info',
  RUNNER_ASSIGNED: 'info',
  RUNNER_EN_ROUTE: 'info',
  ARRIVED: 'info',
  IN_PROGRESS: 'info',
  AWAITING_CUSTOMER: 'info',
  COMPLETED: 'success',
  CONFIRMED: 'success',
  SETTLED: 'success',
  CANCELLED: 'neutral',
  FAILED: 'danger',
  DISPUTED: 'danger',
  EXPIRED: 'neutral',
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const VERIFICATION_VARIANTS: Record<string, ChipVariant> = {
  pending: 'pending',
  in_review: 'pending',
  approved: 'success',
  rejected: 'danger',
};

const LEVEL_LABELS: Record<string, string> = {
  '1_basic': 'Level 1 · Basic',
  '2_id_verified': 'Level 2 · ID verified',
  '3_trusted': 'Level 3 · Trusted',
  '4_professional': 'Level 4 · Professional',
};

const AVAILABILITY_LABELS: Record<string, string> = {
  online: 'Online',
  busy: 'On task',
  offline: 'Offline',
};

const AVAILABILITY_VARIANTS: Record<string, ChipVariant> = {
  online: 'success',
  busy: 'info',
  offline: 'neutral',
};

const REFUND_LABELS: Record<string, string> = {
  pending_review: 'Needs review',
  approved: 'Payout due',
  refunded: 'Refunded',
  no_refund: 'No refund',
  // Not an API status: a refunded review whose payout was reversed (row 100).
  payout_reversed: 'Payout reversed',
};

const REFUND_VARIANTS: Record<string, ChipVariant> = {
  pending_review: 'pending',
  approved: 'pending',
  refunded: 'success',
  no_refund: 'neutral',
  payout_reversed: 'pending',
};

// Runner payout lines by effective status (`_shared.md` §6.1, row 107).
const RUNNER_PAYOUT_LABELS: Record<string, string> = {
  on_hold: 'Needs review',
  payable: 'Payout due',
  // Not an API status: a payable line whose payout was reversed.
  payout_reversed: 'Payout reversed',
  paid: 'Paid',
  rejected: 'Not approved',
};

const RUNNER_PAYOUT_VARIANTS: Record<string, ChipVariant> = {
  on_hold: 'pending',
  payable: 'pending',
  payout_reversed: 'pending',
  paid: 'success',
  rejected: 'neutral',
};

/**
 * Which vocabulary a status string belongs to. The same API string can mean
 * different things per surface (`approved` is a verification outcome but a
 * "payout due" refund), so the caller always says which one it shows.
 */
export type ChipKind =
  'errand' | 'refund' | 'runner_payout' | 'verification' | 'availability' | 'level';

interface Vocabulary {
  labels: Record<string, string>;
  variants: Record<string, ChipVariant>;
  key: (status: string) => string;
  fallbackVariant: ChipVariant;
}

const LEVEL_VARIANTS: Record<string, ChipVariant> = Object.fromEntries(
  Object.keys(LEVEL_LABELS).map((k) => [k, 'info' as ChipVariant]),
);

const VOCABULARIES: Record<ChipKind, Vocabulary> = {
  errand: {
    labels: ERRAND_LABELS,
    variants: ERRAND_VARIANTS,
    key: (s) => s.toUpperCase(),
    fallbackVariant: 'neutral',
  },
  refund: {
    labels: REFUND_LABELS,
    variants: REFUND_VARIANTS,
    key: (s) => s,
    fallbackVariant: 'neutral',
  },
  runner_payout: {
    labels: RUNNER_PAYOUT_LABELS,
    variants: RUNNER_PAYOUT_VARIANTS,
    key: (s) => s,
    fallbackVariant: 'neutral',
  },
  verification: {
    labels: VERIFICATION_LABELS,
    variants: VERIFICATION_VARIANTS,
    key: (s) => s,
    fallbackVariant: 'neutral',
  },
  availability: {
    labels: AVAILABILITY_LABELS,
    variants: AVAILABILITY_VARIANTS,
    key: (s) => s,
    fallbackVariant: 'neutral',
  },
  level: {
    labels: LEVEL_LABELS,
    variants: LEVEL_VARIANTS,
    key: (s) => s,
    fallbackVariant: 'info',
  },
};

/** Human label for an API status string in one vocabulary. Unknown values
 * are title-cased, never hidden. */
export function statusLabel(status: string | null | undefined, kind: ChipKind = 'errand'): string {
  if (!status) {
    return 'Unknown';
  }
  const v = VOCABULARIES[kind];
  return v.labels[v.key(status)] ?? titleCase(status);
}

/** Chip variant (design-system accents) for an API status string. */
export function statusVariant(
  status: string | null | undefined,
  kind: ChipKind = 'errand',
): ChipVariant {
  if (!status) {
    return 'neutral';
  }
  const v = VOCABULARIES[kind];
  return v.variants[v.key(status)] ?? v.fallbackVariant;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Reusable status chip. One component for every status surface (errand state,
 * refund review, runner availability, verification outcome, verification
 * level) so chips are wired to the design system in exactly one place.
 *
 * `label` + `tone` render a fixed flag chip (e.g. `Quote expired`, pending)
 * without a status lookup: a flag is not a state.
 */
@Component({
  selector: 'app-status-chip',
  imports: [],
  template: `
    <span class="chip" [class]="'chip-' + variant()"><span class="dot"></span>{{ text() }}</span>
  `,
  styles: [],
})
export class StatusChipComponent {
  readonly status = input<string | null | undefined>(null);
  readonly kind = input<ChipKind>('errand');
  /** Fixed text; skips the status lookup. */
  readonly label = input<string | null>(null);
  /** Fixed tone; skips the status lookup. */
  readonly tone = input<ChipVariant | null>(null);

  readonly text = computed(() => this.label() ?? statusLabel(this.status(), this.kind()));
  readonly variant = computed(() => this.tone() ?? statusVariant(this.status(), this.kind()));
}
