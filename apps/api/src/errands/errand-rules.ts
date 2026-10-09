import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandPointType, ErrandUrgency } from '../common/enums';

export interface UrgencyThresholds {
  /** Deadline at most this many hours away → `urgent`. */
  urgentWithinHours: number;
  /** Deadline more than this many hours away → `scheduled`. */
  scheduledAfterHours: number;
}

/**
 * `deadline_at` is authoritative; urgency is derived from it on the server
 * (owner decision Q19). No deadline → `standard`.
 * TODO(owner): thresholds are configurable placeholders (errands.*Hours).
 */
export const deriveUrgency = (
  deadlineAt: Date | null,
  thresholds: UrgencyThresholds,
  now: Date = new Date(),
): ErrandUrgency => {
  if (!deadlineAt) {
    return ErrandUrgency.STANDARD;
  }
  const hours = (deadlineAt.getTime() - now.getTime()) / 3_600_000;
  if (hours <= thresholds.urgentWithinHours) {
    return ErrandUrgency.URGENT;
  }
  if (hours > thresholds.scheduledAfterHours) {
    return ErrandUrgency.SCHEDULED;
  }
  return ErrandUrgency.STANDARD;
};

/**
 * Location rules per category (owner decision Q19): at most one pickup and
 * one drop-off per errand; Get It For Me (`pickup_delivery`) needs both.
 * Buy For Me may carry an optional pickup (the shop) plus a drop-off.
 */
export const assertLocationsFit = (
  category: ErrandCategory,
  pointTypes: ErrandPointType[],
): void => {
  const count = (t: ErrandPointType) => pointTypes.filter((p) => p === t).length;
  const pickups = count(ErrandPointType.PICKUP);
  const dropoffs = count(ErrandPointType.DROPOFF);
  if (pickups > 1 || dropoffs > 1) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'locations_duplicate_point',
      'An errand has at most one pickup and one drop-off point',
    );
  }
  if (category === ErrandCategory.PICKUP_DELIVERY && (pickups !== 1 || dropoffs !== 1)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'locations_pickup_dropoff_required',
      'Get It For Me needs one pickup and one drop-off location',
    );
  }
};

export const assertDeadlineInFuture = (deadlineAt: Date | null, now = new Date()): void => {
  if (deadlineAt && deadlineAt.getTime() <= now.getTime()) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'deadline_in_past',
      'The deadline must be in the future',
    );
  }
};

/** Categories whose flow carries a merchant/item budget (row 45). */
export const BUDGET_CATEGORIES = new Set<ErrandCategory>([
  ErrandCategory.BUY_FOR_ME,
  ErrandCategory.PICKUP_DELIVERY,
]);

/**
 * Budget only for Buy For Me and Get It For Me (row 45): required there
 * (400 budget_required), refused elsewhere when positive (400
 * budget_not_applicable). Returns the budget to store.
 */
export const budgetFor = (category: ErrandCategory, budget: number | undefined): number => {
  if (BUDGET_CATEGORIES.has(category)) {
    if (budget === undefined || budget === null) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'budget_required',
        'A budget is required for Buy For Me and Get It For Me tasks',
      );
    }
    return budget;
  }
  if (budget !== undefined && budget !== null && budget > 0) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'budget_not_applicable',
      'A budget only applies to Buy For Me and Get It For Me tasks',
      { category },
    );
  }
  return 0;
};
