// STK result helpers shared by `v-payment` and the item payment's variant
// B (A§7): the state of a payment record and the poll schedule.
import { Payment, StkStatus } from '../data/checkout.api';

/** Poll cadence (A§7), from the payment's `createdAt`. */
export const STK_FAST_MS = 5_000;
export const STK_SLOW_MS = 30_000;
export const STK_FAST_FOR_MS = 120_000;
export const STK_STOP_AFTER_MS = 600_000;
/** The API's STK timeout; used only when `stkStatus` is missing. */
export const STK_TIMEOUT_MS = 120_000;
export const SUCCESS_DELAY_MS = 1_500;

export interface StkResult {
  readonly payment: Payment | null;
  readonly stkStatus: StkStatus | null;
  readonly failureReason: string | null;
}

/** The STK state of a payment record (A§5); `stkStatus` from the API wins. */
export function stkStateOf(result: StkResult, now: Date, timeoutMs = STK_TIMEOUT_MS): StkStatus | null {
  if (result.stkStatus) return result.stkStatus;
  const p = result.payment;
  if (!p) return null;
  if (p.status === 'completed' || p.status === 'authorized') return 'SUCCESS';
  if (p.status === 'failed' || p.status === 'refunded') return 'FAILED';
  const created = new Date(p.createdAt).getTime();
  return !Number.isNaN(created) && now.getTime() - created >= timeoutMs ? 'TIMEOUT' : 'PENDING';
}

/** The poll delay for a payment created at `createdAt`, or null once 10 min have passed (A§7). */
export function stkPollDelay(createdAt: string | null | undefined, now: Date): number | null {
  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  const age = Number.isNaN(created) ? 0 : now.getTime() - created;
  if (age >= STK_STOP_AFTER_MS) return null;
  return age < STK_FAST_FOR_MS ? STK_FAST_MS : STK_SLOW_MS;
}
