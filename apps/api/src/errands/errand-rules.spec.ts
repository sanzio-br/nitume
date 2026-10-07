import { describe, expect, it } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandCategory, ErrandPointType, ErrandUrgency } from '../common/enums';
import { assertDeadlineInFuture, assertLocationsFit, deriveUrgency } from './errand-rules';

const now = new Date('2026-10-07T08:00:00Z');
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const thresholds = { urgentWithinHours: 4, scheduledAfterHours: 72 };

const codeOf = (fn: () => void): string | null => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : 'other';
  }
};

describe('deriveUrgency (deadline_at is authoritative)', () => {
  it('is standard without a deadline', () => {
    expect(deriveUrgency(null, thresholds, now)).toBe(ErrandUrgency.STANDARD);
  });

  it('is urgent at or inside the urgent window', () => {
    expect(deriveUrgency(inHours(1), thresholds, now)).toBe(ErrandUrgency.URGENT);
    expect(deriveUrgency(inHours(4), thresholds, now)).toBe(ErrandUrgency.URGENT);
  });

  it('is standard between the two thresholds', () => {
    expect(deriveUrgency(inHours(5), thresholds, now)).toBe(ErrandUrgency.STANDARD);
    expect(deriveUrgency(inHours(72), thresholds, now)).toBe(ErrandUrgency.STANDARD);
  });

  it('is scheduled beyond the scheduled threshold', () => {
    expect(deriveUrgency(inHours(73), thresholds, now)).toBe(ErrandUrgency.SCHEDULED);
  });
});

describe('assertDeadlineInFuture', () => {
  it('rejects past or present deadlines with deadline_in_past', () => {
    expect(codeOf(() => assertDeadlineInFuture(inHours(-1), now))).toBe('deadline_in_past');
    expect(codeOf(() => assertDeadlineInFuture(now, now))).toBe('deadline_in_past');
    expect(codeOf(() => assertDeadlineInFuture(inHours(1), now))).toBeNull();
    expect(codeOf(() => assertDeadlineInFuture(null, now))).toBeNull();
  });
});

describe('assertLocationsFit', () => {
  const P = ErrandPointType.PICKUP;
  const D = ErrandPointType.DROPOFF;
  const T = ErrandPointType.TASK_SITE;

  it('requires pickup and drop-off for Get It For Me', () => {
    expect(codeOf(() => assertLocationsFit(ErrandCategory.PICKUP_DELIVERY, [P, D]))).toBeNull();
    expect(codeOf(() => assertLocationsFit(ErrandCategory.PICKUP_DELIVERY, [D]))).toBe(
      'locations_pickup_dropoff_required',
    );
    expect(codeOf(() => assertLocationsFit(ErrandCategory.PICKUP_DELIVERY, [T]))).toBe(
      'locations_pickup_dropoff_required',
    );
  });

  it('lets Buy For Me use an optional shop pickup plus a drop-off', () => {
    expect(codeOf(() => assertLocationsFit(ErrandCategory.BUY_FOR_ME, [P, D]))).toBeNull();
    expect(codeOf(() => assertLocationsFit(ErrandCategory.BUY_FOR_ME, [D]))).toBeNull();
  });

  it('rejects duplicate pickup or drop-off points for any category', () => {
    expect(codeOf(() => assertLocationsFit(ErrandCategory.INSPECTION, [D, D]))).toBe(
      'locations_duplicate_point',
    );
    expect(codeOf(() => assertLocationsFit(ErrandCategory.BUY_FOR_ME, [P, P, D]))).toBe(
      'locations_duplicate_point',
    );
    expect(codeOf(() => assertLocationsFit(ErrandCategory.INSPECTION, [T]))).toBeNull();
  });
});
