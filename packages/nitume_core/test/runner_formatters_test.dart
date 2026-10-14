import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  group('R-18 EAT formatters', () {
    // 07:28 UTC = 10:28 AM EAT.
    final t = DateTime.utc(2026, 10, 14, 7, 28);

    test('formatClockEat ignores the device zone', () {
      expect(formatClockEat(t), '10:28 AM');
      expect(formatClockEat(DateTime.utc(2026, 10, 14, 13, 12)), '4:12 PM');
      expect(formatClockEat(DateTime.utc(2026, 10, 14, 21, 5)), '12:05 AM');
      expect(formatClockEat(DateTime.utc(2026, 10, 14, 9)), '12:00 PM');
    });

    test('formatDayTimeEat uses EAT calendar days', () {
      final now = DateTime.utc(2026, 10, 14, 18); // 9 PM EAT, Wed
      expect(formatDayTimeEat(t, now: now), 'Today, 10:28 AM');
      // 22:30 UTC on the 13th is 1:30 AM EAT on the 14th: still today.
      expect(
        formatDayTimeEat(DateTime.utc(2026, 10, 13, 22, 30), now: now),
        'Today, 1:30 AM',
      );
      expect(
        formatDayTimeEat(DateTime.utc(2026, 10, 13, 13, 12), now: now),
        'Yesterday, 4:12 PM',
      );
      expect(
        formatDayTimeEat(DateTime.utc(2026, 10, 12, 7, 28), now: now),
        'Mon, 10:28 AM',
      );
      expect(
        formatDayTimeEat(DateTime.utc(2026, 2, 12, 7, 3), now: now),
        '12 Feb, 10:03 AM',
      );
      expect(
        formatDayTimeEat(DateTime.utc(2025, 2, 12, 7, 3), now: now),
        '12 Feb 2025, 10:03 AM',
      );
    });

    test('formatRelativeShortEat', () {
      final now = DateTime.utc(2026, 10, 14, 8);
      expect(
        formatRelativeShortEat(DateTime.utc(2026, 10, 14, 7, 58), now: now),
        '2m',
      );
      expect(
        formatRelativeShortEat(DateTime.utc(2026, 10, 14, 7), now: now),
        '1h',
      );
      expect(
        formatRelativeShortEat(DateTime.utc(2026, 10, 13, 7), now: now),
        'Yesterday',
      );
      expect(
        formatRelativeShortEat(DateTime.utc(2026, 10, 12, 7), now: now),
        'Mon',
      );
      expect(
        formatRelativeShortEat(DateTime.utc(2026, 9, 2, 7), now: now),
        '2 Sep',
      );
    });

    test('eatDayKey, eatWeekday and eatWeekStart', () {
      // Sunday 21:30 UTC = Monday 00:30 EAT.
      final lateSunday = DateTime.utc(2026, 10, 11, 21, 30);
      expect(eatDayKey(lateSunday), '2026-10-12');
      expect(eatWeekday(lateSunday), DateTime.monday);
      expect(eatWeekStart(lateSunday), DateTime.utc(2026, 10, 11, 21));
      // Wednesday 10:28 EAT belongs to the same week.
      expect(eatWeekStart(t), DateTime.utc(2026, 10, 11, 21));
      // Sunday 20:59 UTC = Sunday 23:59 EAT: previous week.
      expect(
        eatWeekStart(DateTime.utc(2026, 10, 11, 20, 59)),
        DateTime.utc(2026, 10, 4, 21),
      );
    });
  });

  test('formatDistanceKm', () {
    expect(formatDistanceKm(1.2), '1.2 km');
    expect(formatDistanceKm(0.85), '850 m');
    expect(formatDistanceKm(0.004), '0 m');
    expect(formatDistanceKm(0.996), '1.0 km');
    expect(formatDistanceKm(12.46), '12.5 km');
    expect(formatDistanceKm(-1), '0 m');
  });

  test('formatDurationMin', () {
    expect(formatDurationMin(const Duration(minutes: 6)), '6 min');
    expect(formatDurationMin(const Duration(minutes: 45)), '45 min');
    expect(formatDurationMin(const Duration(minutes: 70)), '1 h 10 min');
    expect(formatDurationMin(const Duration(minutes: 120)), '2 h');
    expect(formatDurationMin(const Duration(seconds: 61)), '2 min');
    expect(formatDurationMin(Duration.zero), '1 min');
  });

  test('formatKesLedger', () {
    expect(formatKesLedger('1750.00'), '+ KSh 1,750');
    expect(formatKesLedger('-6000.00'), '− KSh 6,000');
    expect(formatKesLedger(0), 'KSh 0');
  });
}
