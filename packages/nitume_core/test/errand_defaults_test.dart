import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

void main() {
  group('ErrandRepository.defaults (row 221)', () {
    test('reads defaultDeadlineHours', () async {
      final a = FakeApiAdapter({
        'GET /errands/defaults': (200, {'defaultDeadlineHours': 24}),
      });
      final d = await ErrandRepository(fakeClient(a)).defaults();
      expect(a.calls, ['GET /errands/defaults']);
      expect(d.defaultDeadlineHours, 24);
      expect(d.defaultDeadline, const Duration(hours: 24));
    });

    test('reads defaultDeadlineStartsAt (row 235)', () async {
      final a = FakeApiAdapter({
        'GET /errands/defaults': (
          200,
          {
            'defaultDeadlineHours': 24,
            'defaultDeadlineStartsAt': 'payment_confirmed',
          },
        ),
      });
      final d = await ErrandRepository(fakeClient(a)).defaults();
      expect(d.defaultDeadlineStartsAt, DeadlineClockStart.paymentConfirmed);
      expect(d.defaultDeadline, const Duration(hours: 24));
    });

    test('missing or unknown start: null, never guessed', () {
      for (final v in [null, 'created', 3]) {
        final d = ErrandDefaults.fromJson({
          'defaultDeadlineHours': 24,
          'defaultDeadlineStartsAt': v,
        });
        expect(d.defaultDeadlineStartsAt, isNull, reason: '$v');
        expect(d.defaultDeadlineHours, 24);
      }
      expect(const ErrandDefaults().defaultDeadlineStartsAt, isNull);
    });

    test('fractional hours keep minute precision', () {
      final d = ErrandDefaults.fromJson({'defaultDeadlineHours': 1.5});
      expect(d.defaultDeadline, const Duration(minutes: 90));
    });

    test('missing, zero or junk: null, never guessed', () {
      for (final v in [null, 0, -3, 'soon']) {
        final d = ErrandDefaults.fromJson({'defaultDeadlineHours': v});
        expect(d.defaultDeadlineHours, isNull, reason: '$v');
        expect(d.defaultDeadline, isNull);
      }
    });
  });
}
