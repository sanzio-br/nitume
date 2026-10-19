import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

Map<String, dynamic> _errand(String status, [Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'inspection',
  'description': 'Check the flat',
  'status': status,
  'urgency': 'standard',
  'budget': '0.00',
  ...?extra,
};

void main() {
  group('Errand.deadlineAt before payment (rows 235, 237, 239)', () {
    final now = DateTime.utc(2026, 10, 19, 12);

    test('isBeforePayment covers DRAFT, REQUESTED, QUOTED, ACCEPTED only', () {
      expect(ErrandStatus.values.where((s) => s.isBeforePayment).toList(), [
        ErrandStatus.draft,
        ErrandStatus.requested,
        ErrandStatus.quoted,
        ErrandStatus.accepted,
      ]);
    });

    test('Flexible before payment: null deadline, no deadline yet', () {
      for (final s in ['REQUESTED', 'QUOTED', 'ACCEPTED']) {
        final e = Errand.fromJson(_errand(s, {'deadlineAt': null}));
        expect(e.deadlineAt, isNull);
        expect(e.hasNoDeadlineYet, isTrue, reason: s);
        expect(e.deadlinePassedBeforePayment(now), isFalse, reason: s);
      }
      // Absent key reads the same as null.
      expect(Errand.fromJson(_errand('QUOTED')).hasNoDeadlineYet, isTrue);
    });

    test('chosen deadline passed before payment', () {
      final past = Errand.fromJson(
        _errand('QUOTED', {'deadlineAt': '2026-10-19T11:59:00.000Z'}),
      );
      expect(past.hasNoDeadlineYet, isFalse);
      expect(past.deadlinePassedBeforePayment(now), isTrue);
      final exact = Errand.fromJson(
        _errand('ACCEPTED', {'deadlineAt': '2026-10-19T12:00:00.000Z'}),
      );
      expect(exact.deadlinePassedBeforePayment(now), isTrue);
      final future = Errand.fromJson(
        _errand('ACCEPTED', {'deadlineAt': '2026-10-19T20:59:00.000Z'}),
      );
      expect(future.deadlinePassedBeforePayment(now), isFalse);
    });

    test('after payment neither flag applies', () {
      final paid = Errand.fromJson(
        _errand('PAYMENT_CONFIRMED', {
          'deadlineAt': '2026-10-19T11:00:00.000Z',
        }),
      );
      expect(paid.hasNoDeadlineYet, isFalse);
      expect(paid.deadlinePassedBeforePayment(now), isFalse);
      // Cancelled may keep a null deadline (row 239 CHECK) without being
      // "no deadline yet".
      final cancelled = Errand.fromJson(_errand('CANCELLED'));
      expect(cancelled.deadlineAt, isNull);
      expect(cancelled.hasNoDeadlineYet, isFalse);
    });
  });
}
