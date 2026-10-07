import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  test('formatCountdown', () {
    expect(formatCountdown(const Duration(seconds: 60)), '1:00');
    expect(formatCountdown(const Duration(seconds: 42)), '0:42');
    expect(formatCountdown(const Duration(seconds: 5)), '0:05');
    expect(formatCountdown(const Duration(seconds: -3)), '0:00');
  });

  group('formatKes', () {
    test('formats API decimal strings without floating point', () {
      expect(formatKes('2200.00'), 'KSh 2,200');
      expect(formatKes('1500'), 'KSh 1,500');
      expect(formatKes('2200.50'), 'KSh 2,200.50');
      expect(formatKes('2200.5'), 'KSh 2,200.50');
      expect(formatKes('1000000.00'), 'KSh 1,000,000');
      expect(formatKes('0.00'), 'KSh 0');
      expect(formatKes('700'), 'KSh 700');
    });

    test('formats numbers', () {
      expect(formatKes(45000), 'KSh 45,000');
      expect(formatKes(12.3), 'KSh 12.30');
    });

    test('signed deltas', () {
      expect(formatKes(5000, signed: true), '+ KSh 5,000');
      expect(formatKes('-500', signed: true), '- KSh 500');
      expect(formatKes(0, signed: true), 'KSh 0');
    });

    test('rejects non-numeric input', () {
      expect(() => formatKes('abc'), throwsFormatException);
    });

    test('dash for missing values and grouped amounts', () {
      expect(formatKesOrDash(null), '—');
      expect(formatAmount('40000.00'), '40,000');
    });
  });

  group('dates and times', () {
    final now = DateTime(2026, 10, 7, 15, 0); // Wednesday

    test('clock', () {
      expect(formatClock(DateTime(2026, 1, 1, 10, 3)), '10:03 AM');
      expect(formatClock(DateTime(2026, 1, 1, 16, 12)), '4:12 PM');
      expect(formatClock(DateTime(2026, 1, 1, 0, 5)), '12:05 AM');
      expect(formatClock(DateTime(2026, 1, 1, 12, 0)), '12:00 PM');
    });

    test('day + time', () {
      expect(formatDayTime(DateTime(2026, 10, 7, 10, 3), now: now),
          'Today, 10:03 AM');
      expect(formatDayTime(DateTime(2026, 10, 6, 16, 12), now: now),
          'Yesterday, 4:12 PM');
      expect(formatDayTime(DateTime(2026, 10, 5, 10, 3), now: now),
          'Mon, 10:03 AM');
      expect(formatDayTime(DateTime(2026, 2, 12, 9, 0), now: now),
          '12 Feb, 9:00 AM');
      expect(formatDayTime(DateTime(2025, 2, 12, 9, 0), now: now),
          '12 Feb 2025, 9:00 AM');
    });

    test('relative short', () {
      expect(formatRelativeShort(now.subtract(const Duration(minutes: 2)),
          now: now), '2m');
      expect(formatRelativeShort(now.subtract(const Duration(hours: 1)),
          now: now), '1h');
      expect(formatRelativeShort(DateTime(2026, 10, 6, 9), now: now),
          'Yesterday');
      expect(formatRelativeShort(DateTime(2026, 10, 5, 9), now: now), 'Mon');
    });

    test('eta, counter, rating, month-year', () {
      expect(formatEta(const Duration(minutes: 12)), 'ETA 12 min');
      expect(formatEta(const Duration(seconds: 61)), 'ETA 2 min');
      expect(formatCounter(3, 5), '3/5');
      expect(formatRating('4.90'), '4.9');
      expect(formatMonthYear(DateTime(2026, 2, 3)), 'Feb 2026');
    });
  });
}
