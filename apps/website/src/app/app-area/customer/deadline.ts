// Customer deadline helpers (owner WQ-2: deadlines use EAT, whatever the
// browser's zone). Moved here from the #7 wizard store (#8 A§8) so the
// wizard and the checkout's deadline panel share one copy; the store
// re-exports `deadlineAt` and `DeadlineChoice`.
import { eatDayKey } from '../../shared/format/formatters';

export type DeadlineChoice = 'today' | 'tomorrow' | 'flexible';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 23:59 EAT of `now`'s EAT calendar date, as an instant (EAT has no daylight saving). */
function endOfEatDay(now: Date): Date {
  return new Date(`${eatDayKey(now)}T23:59:00.000+03:00`);
}

/**
 * `Today` / `Tomorrow` end at 23:59 EAT of the EAT calendar date (owner
 * WQ-2: deadlines use EAT, whatever the browser's zone), sent as UTC. The
 * EAT date comes from the kit helper; EAT has no daylight saving.
 */
export function deadlineAt(choice: DeadlineChoice, now: Date): string | null {
  if (choice === 'flexible') return null;
  const days = choice === 'today' ? 0 : 1;
  return new Date(endOfEatDay(now).getTime() + days * DAY_MS).toISOString();
}

/**
 * The chip a saved deadline corresponds to (#8 deadline panel): 23:59 EAT
 * of today's EAT date → `today`, of tomorrow's → `tomorrow`; no deadline →
 * `flexible`; any other time → `null` (no chip selected).
 */
export function deadlineChoiceOf(saved: string | null, now: Date): DeadlineChoice | null {
  if (saved === null) return 'flexible';
  const at = new Date(saved).getTime();
  if (Number.isNaN(at)) return null;
  if (at === new Date(deadlineAt('today', now) as string).getTime()) return 'today';
  if (at === new Date(deadlineAt('tomorrow', now) as string).getTime()) return 'tomorrow';
  return null;
}
