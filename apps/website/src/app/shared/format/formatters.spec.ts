import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CUSTOMER_MVP_CATEGORIES,
  CategoryNamePipe,
  ERRAND_CATEGORIES,
  FORMAT_PIPES,
  NmNum,
  categoryName,
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
} from './index';

// Local-time vectors use local constructors, so they hold in any zone.
// 28 Oct 2026 is a Wednesday; 26 Oct is the Monday.
const localNow = new Date(2026, 9, 28, 12, 0);
// EAT vectors: now = Wed 28 Oct 2026 12:00 EAT.
const eatNow = new Date('2026-10-28T09:00:00Z');

function eatBlock(): string[] {
  return [
    formatClockEat('2026-10-28T07:28:00Z'),
    formatClockEat('2026-10-28T21:30:00Z'),
    formatDayTimeEat('2026-10-27T21:30:00Z', eatNow),
    formatDeadlineEat('2026-10-28T20:59:00Z', eatNow),
    formatRelativeShortEat('2026-10-27T20:30:00Z', eatNow),
    eatDayKey('2026-10-28T21:30:00Z'),
    String(eatWeekday('2026-11-01T20:59:00Z')),
    String(eatWeekday('2026-11-01T21:00:00Z')),
    eatWeekStart('2026-10-28T21:30:00Z').toISOString(),
  ];
}

const EAT_BLOCK_EXPECTED = [
  '10:28 AM',
  '12:30 AM',
  'Today, 12:30 AM',
  'Today, 11:59 PM',
  'Yesterday',
  '2026-10-29',
  '7',
  '1',
  '2026-10-25T21:00:00.000Z',
];

describe('formatting (§12.9)', () => {
  it('40. every §5.2 test vector, one assertion per row', () => {
    // formatKes
    expect(formatKes(2200)).toBe('KSh 2,200');
    expect(formatKes('2200.00')).toBe('KSh 2,200');
    expect(formatKes('2200.5')).toBe('KSh 2,200.50');
    expect(formatKes('1234567.89')).toBe('KSh 1,234,567.89');
    expect(formatKes('-500')).toBe('- KSh 500');
    expect(formatKes(5000, { signed: true })).toBe('+ KSh 5,000');
    expect(formatKes(0, { signed: true })).toBe('KSh 0');
    expect(formatKes('-0.00')).toBe('KSh 0');
    expect(formatKes('1.239')).toBe('KSh 1.23');
    expect(formatKes(1.239)).toBe('KSh 1.24');
    expect(formatKes('1,200')).toBe('KSh 1,200');
    expect(() => formatKes('abc')).toThrow();
    // formatKesOrDash
    expect(formatKesOrDash(null)).toBe('—');
    expect(formatKesOrDash(undefined)).toBe('—');
    // formatAmount
    expect(formatAmount('40000')).toBe('40,000');
    expect(formatAmount(-40000)).toBe('-40,000');
    // formatKesLedger
    expect(formatKesLedger(1750)).toBe('+ KSh 1,750');
    expect(formatKesLedger('-6000')).toBe('− KSh 6,000');
    expect(formatKesLedger(0)).toBe('KSh 0');
    // kesSpoken
    expect(kesSpoken(1750)).toBe('1,750 shillings');
    expect(kesSpoken(-6000)).toBe('minus 6,000 shillings');
    // formatClock (local)
    expect(formatClock(new Date(2026, 9, 28, 10, 3))).toBe('10:03 AM');
    expect(formatClock(new Date(2026, 9, 28, 0, 5))).toBe('12:05 AM');
    expect(formatClock(new Date(2026, 9, 28, 12, 0))).toBe('12:00 PM');
    // formatDayTime (local)
    expect(formatDayTime(new Date(2026, 9, 28, 10, 3), localNow)).toBe('Today, 10:03 AM');
    expect(formatDayTime(new Date(2026, 9, 27, 16, 12), localNow)).toBe('Yesterday, 4:12 PM');
    expect(formatDayTime(new Date(2026, 9, 26, 10, 3), localNow)).toBe('Mon, 10:03 AM');
    expect(formatDayTime(new Date(2026, 1, 12, 10, 3), localNow)).toBe('12 Feb, 10:03 AM');
    expect(formatDayTime(new Date(2025, 1, 12, 10, 3), localNow)).toBe('12 Feb 2025, 10:03 AM');
    // formatRelativeShort (local)
    expect(formatRelativeShort(new Date(2026, 9, 28, 11, 59, 30), localNow)).toBe('1m');
    expect(formatRelativeShort(new Date(2026, 9, 28, 11, 1), localNow)).toBe('59m');
    expect(formatRelativeShort(new Date(2026, 9, 28, 10, 30), localNow)).toBe('1h');
    expect(formatRelativeShort(new Date(2026, 9, 27, 10, 0), localNow)).toBe('Yesterday');
    expect(formatRelativeShort(new Date(2026, 9, 26, 10, 0), localNow)).toBe('Mon');
    expect(formatRelativeShort(new Date(2026, 1, 12, 10, 0), localNow)).toBe('12 Feb');
    expect(formatRelativeShort(new Date(2025, 1, 12, 10, 0), localNow)).toBe('12 Feb 2025');
    // formatShortDate
    expect(formatShortDate(new Date(2026, 1, 12), localNow)).toBe('12 Feb');
    expect(formatShortDate(new Date(2025, 1, 12), localNow)).toBe('12 Feb 2025');
    // formatMonthYear
    expect(formatMonthYear(new Date(2026, 1, 12))).toBe('Feb 2026');
    // formatEta
    expect(formatEta(720)).toBe('ETA 12 min');
    expect(formatEta(61)).toBe('ETA 2 min');
    expect(formatEta(0)).toBe('ETA 1 min');
    expect(formatEta(-30)).toBe('ETA 1 min');
    // formatCountdown
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(-5)).toBe('0:00');
    // formatCounter
    expect(formatCounter(3, 5)).toBe('3/5');
    // formatRating
    expect(formatRating('4.90')).toBe('4.9');
    expect(formatRating(5)).toBe('5.0');
    // formatClockEat
    expect(formatClockEat('2026-10-28T07:28:00Z')).toBe('10:28 AM');
    expect(formatClockEat('2026-10-28T21:30:00Z')).toBe('12:30 AM');
    // formatDayTimeEat
    expect(formatDayTimeEat('2026-10-28T07:03:00Z', eatNow)).toBe('Today, 10:03 AM');
    expect(formatDayTimeEat('2026-10-27T13:12:00Z', eatNow)).toBe('Yesterday, 4:12 PM');
    expect(formatDayTimeEat('2026-10-26T07:03:00Z', eatNow)).toBe('Mon, 10:03 AM');
    expect(formatDayTimeEat('2026-02-12T07:03:00Z', eatNow)).toBe('12 Feb, 10:03 AM');
    expect(formatDayTimeEat('2025-02-12T07:03:00Z', eatNow)).toBe('12 Feb 2025, 10:03 AM');
    // formatDeadlineEat
    expect(formatDeadlineEat('2026-10-28T20:59:00Z', eatNow)).toBe('Today, 11:59 PM');
    expect(formatDeadlineEat('2026-10-29T20:59:00Z', eatNow)).toBe('Tomorrow, 11:59 PM');
    expect(formatDeadlineEat('2026-10-27T13:12:00Z', eatNow)).toBe('Yesterday, 4:12 PM');
    expect(formatDeadlineEat('2026-10-24T20:59:00Z', eatNow)).toBe('24 Oct, 11:59 PM');
    expect(formatDeadlineEat('2027-01-03T20:59:00Z', eatNow)).toBe('3 Jan 2027, 11:59 PM');
    // formatRelativeShortEat
    expect(formatRelativeShortEat('2026-10-28T08:59:30Z', eatNow)).toBe('1m');
    expect(formatRelativeShortEat('2026-10-28T08:01:00Z', eatNow)).toBe('59m');
    expect(formatRelativeShortEat('2026-10-28T07:30:00Z', eatNow)).toBe('1h');
    expect(formatRelativeShortEat('2026-10-27T10:00:00Z', eatNow)).toBe('Yesterday');
    expect(formatRelativeShortEat('2026-10-26T10:00:00Z', eatNow)).toBe('Mon');
    expect(formatRelativeShortEat('2026-02-12T10:00:00Z', eatNow)).toBe('12 Feb');
    expect(formatRelativeShortEat('2025-02-12T10:00:00Z', eatNow)).toBe('12 Feb 2025');
    // eatDayKey
    expect(eatDayKey('2026-10-28T21:30:00Z')).toBe('2026-10-29');
    // eatWeekday, eatWeekStart
    expect(eatWeekday('2026-10-28T21:30:00Z')).toBe(4);
    expect(eatWeekday('2026-11-01T20:59:00Z')).toBe(7);
    expect(eatWeekday('2026-11-01T21:00:00Z')).toBe(1);
    expect(eatWeekStart('2026-10-28T21:30:00Z').toISOString()).toBe('2026-10-25T21:00:00.000Z');
    // formatDistanceKm
    expect(formatDistanceKm(0.85)).toBe('850 m');
    expect(formatDistanceKm(0.994)).toBe('990 m');
    expect(formatDistanceKm(0.996)).toBe('1.0 km');
    expect(formatDistanceKm(1.2)).toBe('1.2 km');
    expect(formatDistanceKm(-1)).toBe('0 m');
    // formatDurationMin
    expect(formatDurationMin(360)).toBe('6 min');
    expect(formatDurationMin(2700)).toBe('45 min');
    expect(formatDurationMin(4200)).toBe('1 h 10 min');
    expect(formatDurationMin(7200)).toBe('2 h');
    expect(formatDurationMin(0)).toBe('1 min');
    // formatPhoneIntl
    expect(formatPhoneIntl('0712345678')).toBe('+254 712 345 678');
    expect(formatPhoneIntl('+254712345678')).toBe('+254 712 345 678');
    expect(formatPhoneIntl('254712345678')).toBe('+254 712 345 678');
    expect(formatPhoneIntl('12345')).toBe('12345');
  });

  it('41. EAT functions give the same output whatever the process time zone', () => {
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = 'America/New_York';
      // Prove the zone switch took effect (EDT on 28 Oct 2026 is UTC−4).
      expect(new Date('2026-10-28T12:00:00Z').getTimezoneOffset()).toBe(240);
      expect(eatBlock()).toEqual(EAT_BLOCK_EXPECTED);

      process.env['TZ'] = 'Africa/Nairobi';
      expect(new Date('2026-10-28T12:00:00Z').getTimezoneOffset()).toBe(-180);
      expect(eatBlock()).toEqual(EAT_BLOCK_EXPECTED);

      process.env['TZ'] = 'Asia/Tokyo';
      expect(eatBlock()).toEqual(EAT_BLOCK_EXPECTED);
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('42. local functions use the injected now, not the system clock', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2031, 5, 1, 9, 0));
      const t = new Date(2026, 9, 28, 10, 3);
      expect(formatDayTime(t, localNow)).toBe('Today, 10:03 AM');
      expect(formatRelativeShort(new Date(2026, 9, 28, 11, 1), localNow)).toBe('59m');
      expect(formatShortDate(t, localNow)).toBe('28 Oct');
      expect(formatDayTimeEat('2026-10-28T07:03:00Z', eatNow)).toBe('Today, 10:03 AM');
      // Without an injected now, the (faked) system clock is the reference.
      expect(formatShortDate(t)).toBe('28 Oct 2026');
      expect(formatDayTime(new Date(2031, 5, 1, 8, 0))).toBe('Today, 8:00 AM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('43. nmNum applies the numeric family and the named style; nmNumLabel sets aria-label', () => {
    @Component({
      imports: [NmNum, ...FORMAT_PIPES],
      template: `
        <span id="plain" nmNum>3/5</span>
        <span id="meta" nmNum="meta">10:03 AM</span>
        <span id="amount" nmNum="amount" [nmNumLabel]="'minus 6,000 shillings'">{{ -6000 | formatKesLedger }}</span>
      `,
    })
    class Host {}

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;

    const plain = getComputedStyle(el('plain'));
    expect(plain.fontFamily).toBe('var(--nitume-font-num)');
    expect(plain.fontSize).toBe(''); // inherits: only the family switches
    expect(el('plain').className).toBe('nm-num');
    expect(el('plain').hasAttribute('aria-label')).toBe(false);

    const meta = getComputedStyle(el('meta'));
    expect(meta.fontFamily).toBe('var(--nitume-font-num)');
    expect(meta.fontSize).toBe('11px');
    expect(meta.color).toBe('var(--nitume-slate-600)');

    const amount = getComputedStyle(el('amount'));
    expect(amount.fontSize).toBe('20px');
    expect(amount.fontWeight).toBe('600');
    expect(el('amount').textContent).toBe('− KSh 6,000');
    expect(el('amount').getAttribute('aria-label')).toBe('minus 6,000 shillings');
  });

  it('44. categoryName for all six wire values; unknown → empty; five customer categories', () => {
    expect(ERRAND_CATEGORIES.map(categoryName)).toEqual([
      'Buy For Me',
      'Get It For Me',
      'Check It For Me',
      'Go There For Me',
      'Wait For Me',
      'Business Tasks',
    ]);
    expect(categoryName('errands')).toBe('');
    expect(categoryName(undefined)).toBe('');
    expect(new CategoryNamePipe().transform('queue_admin')).toBe('Wait For Me');
    expect(CUSTOMER_MVP_CATEGORIES).toHaveLength(5);
    expect(CUSTOMER_MVP_CATEGORIES).not.toContain('business');
  });
});
