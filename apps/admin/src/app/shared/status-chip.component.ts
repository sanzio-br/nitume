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

/** Human label for an API status string. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) {
    return 'Unknown';
  }
  const key = status.toUpperCase();
  return (
    ERRAND_LABELS[key] ??
    VERIFICATION_LABELS[status] ??
    LEVEL_LABELS[status] ??
    AVAILABILITY_LABELS[status] ??
    titleCase(status)
  );
}

/** Chip variant (design-system accents) for an API status string. */
export function statusVariant(status: string | null | undefined): ChipVariant {
  if (!status) {
    return 'neutral';
  }
  const key = status.toUpperCase();
  return (
    ERRAND_VARIANTS[key] ??
    AVAILABILITY_VARIANTS[status] ??
    VERIFICATION_VARIANTS[status] ??
    (LEVEL_LABELS[status] ? 'info' : 'neutral')
  );
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Reusable status chip. One component for every status surface (errand state,
 * runner availability, verification outcome, verification level) so chips are
 * wired to the design system in exactly one place — never inline per screen.
 */
@Component({
  selector: 'app-status-chip',
  imports: [],
  template: `
    <span class="chip" [class]="'chip-' + variant()"> <span class="dot"></span>{{ label() }} </span>
  `,
  styles: [],
})
export class StatusChipComponent {
  readonly status = input<string | null | undefined>(null);

  readonly label = computed(() => statusLabel(this.status()));
  readonly variant = computed(() => statusVariant(this.status()));
}
