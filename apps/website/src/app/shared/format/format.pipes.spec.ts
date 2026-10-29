// Every formatting pipe (ui-kit spec §5.2): a present value gives the
// formatter's output (including forwarded options / injected `now`), and a
// missing value gives `—` (`kesSpoken` → '', EAT weekday/week start → null).
import { PipeTransform } from '@angular/core';
import {
  EatDayKeyPipe,
  EatWeekStartPipe,
  EatWeekdayPipe,
  FORMAT_PIPES,
  FormatAmountPipe,
  FormatClockEatPipe,
  FormatClockPipe,
  FormatCountdownPipe,
  FormatCounterPipe,
  FormatDayTimeEatPipe,
  FormatDayTimePipe,
  FormatDeadlineEatPipe,
  FormatDistanceKmPipe,
  FormatDurationMinPipe,
  FormatEtaPipe,
  FormatHoursPipe,
  FormatKesLedgerPipe,
  FormatKesOrDashPipe,
  FormatKesPipe,
  FormatMonthYearPipe,
  FormatPhoneIntlPipe,
  FormatRatingPipe,
  FormatRelativeShortEatPipe,
  FormatRelativeShortPipe,
  FormatShortDatePipe,
  KesSpokenPipe,
} from './index';

type AnyPipe = PipeTransform & { transform: (...args: never[]) => unknown };
type Args = unknown[];

interface PipeCase {
  readonly name: string;
  readonly pipe: AnyPipe;
  /** Present values: [args, expected output]. */
  readonly present: readonly (readonly [Args, unknown])[];
  /** Missing inputs: [args, expected output]. */
  readonly missing: readonly (readonly [Args, unknown])[];
}

const localNow = new Date(2026, 9, 28, 12, 0); // Wed 28 Oct 2026, local
const eatNow = new Date('2026-10-28T09:00:00Z'); // Wed 28 Oct 2026 12:00 EAT
const DASH: readonly (readonly [Args, unknown])[] = [
  [[null], '—'],
  [[undefined], '—'],
];

const CASES: readonly PipeCase[] = [
  {
    name: 'formatKes',
    pipe: new FormatKesPipe() as AnyPipe,
    present: [
      [['2200.00'], 'KSh 2,200'],
      [[5000, { signed: true }], '+ KSh 5,000'], // options forwarded
      [[5000], 'KSh 5,000'],
    ],
    missing: [...DASH, [[null, { signed: true }], '—']],
  },
  {
    name: 'formatKesOrDash',
    pipe: new FormatKesOrDashPipe() as AnyPipe,
    present: [[['1234567.89'], 'KSh 1,234,567.89']],
    missing: DASH,
  },
  {
    name: 'formatAmount',
    pipe: new FormatAmountPipe() as AnyPipe,
    present: [[['40000'], '40,000']],
    missing: DASH,
  },
  {
    name: 'formatKesLedger',
    pipe: new FormatKesLedgerPipe() as AnyPipe,
    present: [[['-6000'], '− KSh 6,000']],
    missing: DASH,
  },
  {
    name: 'kesSpoken',
    pipe: new KesSpokenPipe() as AnyPipe,
    present: [[[-6000], 'minus 6,000 shillings']],
    missing: [
      [[null], ''],
      [[undefined], ''],
    ],
  },
  {
    name: 'formatClock',
    pipe: new FormatClockPipe() as AnyPipe,
    present: [[[new Date(2026, 9, 28, 10, 3)], '10:03 AM']],
    missing: DASH,
  },
  {
    name: 'formatDayTime',
    pipe: new FormatDayTimePipe() as AnyPipe,
    present: [
      [[new Date(2026, 9, 27, 16, 12), localNow], 'Yesterday, 4:12 PM'], // now forwarded
    ],
    missing: [...DASH, [[null, localNow], '—']],
  },
  {
    name: 'formatRelativeShort',
    pipe: new FormatRelativeShortPipe() as AnyPipe,
    present: [[[new Date(2026, 9, 28, 11, 1), localNow], '59m']],
    missing: [...DASH, [[undefined, localNow], '—']],
  },
  {
    name: 'formatShortDate',
    pipe: new FormatShortDatePipe() as AnyPipe,
    present: [[[new Date(2025, 1, 12), localNow], '12 Feb 2025']],
    missing: [...DASH, [[null, localNow], '—']],
  },
  {
    name: 'formatMonthYear',
    pipe: new FormatMonthYearPipe() as AnyPipe,
    present: [[[new Date(2026, 1, 12)], 'Feb 2026']],
    missing: DASH,
  },
  {
    name: 'formatEta',
    pipe: new FormatEtaPipe() as AnyPipe,
    present: [
      [[720], 'ETA 12 min'],
      [[0], 'ETA 1 min'], // 0 is a value, not missing
    ],
    missing: DASH,
  },
  {
    name: 'formatCountdown',
    pipe: new FormatCountdownPipe() as AnyPipe,
    present: [
      [[42], '0:42'],
      [[0], '0:00'],
    ],
    missing: DASH,
  },
  {
    name: 'formatCounter',
    pipe: new FormatCounterPipe() as AnyPipe,
    present: [
      [[3, 5], '3/5'],
      [[0, 0], '0/0'],
    ],
    missing: [
      [[null, 5], '—'],
      [[3, null], '—'],
      [[undefined, undefined], '—'],
    ],
  },
  {
    name: 'formatRating',
    pipe: new FormatRatingPipe() as AnyPipe,
    present: [
      [['4.90'], '4.9'],
      [[5], '5.0'],
    ],
    missing: DASH,
  },
  {
    name: 'formatClockEat',
    pipe: new FormatClockEatPipe() as AnyPipe,
    present: [[['2026-10-28T21:30:00Z'], '12:30 AM']],
    missing: DASH,
  },
  {
    name: 'formatDayTimeEat',
    pipe: new FormatDayTimeEatPipe() as AnyPipe,
    present: [[['2026-10-27T21:30:00Z', eatNow], 'Today, 12:30 AM']],
    missing: [...DASH, [[null, eatNow], '—']],
  },
  {
    name: 'formatDeadlineEat',
    pipe: new FormatDeadlineEatPipe() as AnyPipe,
    present: [[['2026-10-29T20:59:00Z', eatNow], 'Tomorrow, 11:59 PM']],
    missing: [...DASH, [[undefined, eatNow], '—']],
  },
  {
    name: 'formatRelativeShortEat',
    pipe: new FormatRelativeShortEatPipe() as AnyPipe,
    present: [[['2026-10-27T20:30:00Z', eatNow], 'Yesterday']],
    missing: [...DASH, [[null, eatNow], '—']],
  },
  {
    name: 'eatDayKey',
    pipe: new EatDayKeyPipe() as AnyPipe,
    present: [[['2026-10-28T21:30:00Z'], '2026-10-29']],
    missing: DASH,
  },
  {
    name: 'eatWeekday',
    pipe: new EatWeekdayPipe() as AnyPipe,
    present: [
      [['2026-11-01T20:59:00Z'], 7],
      [['2026-11-01T21:00:00Z'], 1],
    ],
    missing: [
      [[null], null],
      [[undefined], null],
    ],
  },
  {
    name: 'eatWeekStart',
    pipe: new EatWeekStartPipe() as AnyPipe,
    present: [[['2026-10-28T21:30:00Z'], new Date('2026-10-25T21:00:00.000Z')]],
    missing: [
      [[null], null],
      [[undefined], null],
    ],
  },
  {
    name: 'formatDistanceKm',
    pipe: new FormatDistanceKmPipe() as AnyPipe,
    present: [
      [[0.85], '850 m'],
      [[0], '0 m'],
    ],
    missing: DASH,
  },
  {
    name: 'formatDurationMin',
    pipe: new FormatDurationMinPipe() as AnyPipe,
    present: [[[4200], '1 h 10 min']],
    missing: DASH,
  },
  {
    // #7 (customer-v-new-category §W9a).
    name: 'formatHours',
    pipe: new FormatHoursPipe() as AnyPipe,
    present: [
      [[86400], '24 hours'],
      [[5400], '1 h 30 min'],
    ],
    missing: DASH,
  },
  {
    name: 'formatPhoneIntl',
    pipe: new FormatPhoneIntlPipe() as AnyPipe,
    present: [
      [['0712345678'], '+254 712 345 678'],
      [[''], ''], // empty string is a value: returned unchanged
    ],
    missing: DASH,
  },
];

describe('format pipes (§5.2)', () => {
  it('covers every pipe in FORMAT_PIPES exactly once', () => {
    const tested = CASES.map((c) => c.pipe.constructor);
    expect(new Set(tested).size).toBe(CASES.length);
    expect([...FORMAT_PIPES].sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      [...tested].sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(CASES).toHaveLength(25);
  });

  describe.each(CASES)('$name', ({ pipe, present, missing }) => {
    it.each(present)('formats a present value %j', (args, expected) => {
      expect((pipe.transform as (...a: Args) => unknown)(...args)).toEqual(expected);
    });

    it.each(missing)('renders the missing-value form for %j', (args, expected) => {
      expect((pipe.transform as (...a: Args) => unknown)(...args)).toEqual(expected);
    });
  });

  it('a pipe whose formatter rejects the input still throws (no silent dash)', () => {
    expect(() => new FormatKesPipe().transform('abc')).toThrow();
    expect(() => new FormatRatingPipe().transform('n/a')).toThrow();
  });
});
