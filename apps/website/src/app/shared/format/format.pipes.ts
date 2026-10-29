// One standalone pure pipe per formatter (ui-kit spec §5.2), same names.
// A missing input (null/undefined) renders `—` (§5.2 copy rule).
import { Pipe, PipeTransform } from '@angular/core';
import {
  Amount,
  DateInput,
  MISSING_VALUE,
  eatDayKey,
  eatWeekStart,
  eatWeekday,
  formatAmount,
  formatClock,
  formatClockEat,
  formatCountdown,
  formatCounter,
  formatDayTime,
  formatDayTimeEat,
  formatDeadlineEat,
  formatDistanceKm,
  formatDurationMin,
  formatEta,
  formatKes,
  formatKesLedger,
  formatKesOrDash,
  formatMonthYear,
  formatPhoneIntl,
  formatRating,
  formatRelativeShort,
  formatRelativeShortEat,
  formatShortDate,
  kesSpoken,
} from './formatters';

type Maybe<T> = T | null | undefined;

const missing = (v: unknown): v is null | undefined => v === null || v === undefined;

@Pipe({ name: 'formatKes' })
export class FormatKesPipe implements PipeTransform {
  transform(amount: Maybe<Amount>, opts?: { signed?: boolean }): string {
    return missing(amount) ? MISSING_VALUE : formatKes(amount, opts);
  }
}

@Pipe({ name: 'formatKesOrDash' })
export class FormatKesOrDashPipe implements PipeTransform {
  transform(amount: Maybe<Amount>): string {
    return formatKesOrDash(amount);
  }
}

@Pipe({ name: 'formatAmount' })
export class FormatAmountPipe implements PipeTransform {
  transform(amount: Maybe<Amount>): string {
    return missing(amount) ? MISSING_VALUE : formatAmount(amount);
  }
}

@Pipe({ name: 'formatKesLedger' })
export class FormatKesLedgerPipe implements PipeTransform {
  transform(amount: Maybe<Amount>): string {
    return missing(amount) ? MISSING_VALUE : formatKesLedger(amount);
  }
}

@Pipe({ name: 'kesSpoken' })
export class KesSpokenPipe implements PipeTransform {
  transform(amount: Maybe<Amount>): string {
    return missing(amount) ? '' : kesSpoken(amount);
  }
}

@Pipe({ name: 'formatClock' })
export class FormatClockPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): string {
    return missing(date) ? MISSING_VALUE : formatClock(date);
  }
}

@Pipe({ name: 'formatDayTime' })
export class FormatDayTimePipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatDayTime(date, now);
  }
}

@Pipe({ name: 'formatRelativeShort' })
export class FormatRelativeShortPipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatRelativeShort(date, now);
  }
}

@Pipe({ name: 'formatShortDate' })
export class FormatShortDatePipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatShortDate(date, now);
  }
}

@Pipe({ name: 'formatMonthYear' })
export class FormatMonthYearPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): string {
    return missing(date) ? MISSING_VALUE : formatMonthYear(date);
  }
}

@Pipe({ name: 'formatEta' })
export class FormatEtaPipe implements PipeTransform {
  transform(seconds: Maybe<number>): string {
    return missing(seconds) ? MISSING_VALUE : formatEta(seconds);
  }
}

@Pipe({ name: 'formatCountdown' })
export class FormatCountdownPipe implements PipeTransform {
  transform(seconds: Maybe<number>): string {
    return missing(seconds) ? MISSING_VALUE : formatCountdown(seconds);
  }
}

@Pipe({ name: 'formatCounter' })
export class FormatCounterPipe implements PipeTransform {
  transform(done: Maybe<number>, total: Maybe<number>): string {
    return missing(done) || missing(total) ? MISSING_VALUE : formatCounter(done, total);
  }
}

@Pipe({ name: 'formatRating' })
export class FormatRatingPipe implements PipeTransform {
  transform(value: Maybe<number | string>): string {
    return missing(value) ? MISSING_VALUE : formatRating(value);
  }
}

@Pipe({ name: 'formatClockEat' })
export class FormatClockEatPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): string {
    return missing(date) ? MISSING_VALUE : formatClockEat(date);
  }
}

@Pipe({ name: 'formatDayTimeEat' })
export class FormatDayTimeEatPipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatDayTimeEat(date, now);
  }
}

@Pipe({ name: 'formatDeadlineEat' })
export class FormatDeadlineEatPipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatDeadlineEat(date, now);
  }
}

@Pipe({ name: 'formatRelativeShortEat' })
export class FormatRelativeShortEatPipe implements PipeTransform {
  transform(date: Maybe<DateInput>, now?: Date): string {
    return missing(date) ? MISSING_VALUE : formatRelativeShortEat(date, now);
  }
}

@Pipe({ name: 'eatDayKey' })
export class EatDayKeyPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): string {
    return missing(date) ? MISSING_VALUE : eatDayKey(date);
  }
}

@Pipe({ name: 'eatWeekday' })
export class EatWeekdayPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): number | null {
    return missing(date) ? null : eatWeekday(date);
  }
}

@Pipe({ name: 'eatWeekStart' })
export class EatWeekStartPipe implements PipeTransform {
  transform(date: Maybe<DateInput>): Date | null {
    return missing(date) ? null : eatWeekStart(date);
  }
}

@Pipe({ name: 'formatDistanceKm' })
export class FormatDistanceKmPipe implements PipeTransform {
  transform(km: Maybe<number>): string {
    return missing(km) ? MISSING_VALUE : formatDistanceKm(km);
  }
}

@Pipe({ name: 'formatDurationMin' })
export class FormatDurationMinPipe implements PipeTransform {
  transform(seconds: Maybe<number>): string {
    return missing(seconds) ? MISSING_VALUE : formatDurationMin(seconds);
  }
}

@Pipe({ name: 'formatPhoneIntl' })
export class FormatPhoneIntlPipe implements PipeTransform {
  transform(phone: Maybe<string>): string {
    return missing(phone) ? MISSING_VALUE : formatPhoneIntl(phone);
  }
}

/** Every formatting pipe, for a view's `imports`. */
export const FORMAT_PIPES = [
  FormatKesPipe,
  FormatKesOrDashPipe,
  FormatAmountPipe,
  FormatKesLedgerPipe,
  KesSpokenPipe,
  FormatClockPipe,
  FormatDayTimePipe,
  FormatRelativeShortPipe,
  FormatShortDatePipe,
  FormatMonthYearPipe,
  FormatEtaPipe,
  FormatCountdownPipe,
  FormatCounterPipe,
  FormatRatingPipe,
  FormatClockEatPipe,
  FormatDayTimeEatPipe,
  FormatDeadlineEatPipe,
  FormatRelativeShortEatPipe,
  EatDayKeyPipe,
  EatWeekdayPipe,
  EatWeekStartPipe,
  FormatDistanceKmPipe,
  FormatDurationMinPipe,
  FormatPhoneIntlPipe,
] as const;
