import 'package:dio/dio.dart';
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

NitumeApiException _error(int status, Map<String, Object?> body) =>
    NitumeApiException.fromDio(
      DioException(
        requestOptions: RequestOptions(path: '/errands/e1'),
        response: Response(
          requestOptions: RequestOptions(path: '/errands/e1'),
          statusCode: status,
          data: body,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

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

  group('Round 14-16 error codes (rows 233, 237, 243, 244)', () {
    test('wire values match the API', () {
      expect(
        ApiErrorCodes.locationOutsideServiceArea,
        'location_outside_service_area',
      );
      expect(
        ApiErrorCodes.deadlinePassedBeforePayment,
        'deadline_passed_before_payment',
      );
      expect(ApiErrorCodes.deadlineNotEditable, 'deadline_not_editable');
      expect(ApiErrorCodes.deadlineInPast, 'deadline_in_past');
      expect(ApiErrorCodes.deadlineCustomerOnly, 'deadline_customer_only');
    });

    test('location_outside_service_area (422) with pointType', () {
      final e = _error(422, {
        'statusCode': 422,
        'code': 'location_outside_service_area',
        'message': 'This location is outside the areas we serve.',
        'pointType': 'task_site',
      });
      expect(e.statusCode, 422);
      expect(e.isLocationOutsideServiceArea, isTrue);
      expect(e.pointTypeDetail, ErrandPointType.taskSite);
      expect(e.deadlineProblem, isNull);
      expect(
        _error(422, {'code': 'location_outside_service_area'}).pointTypeDetail,
        isNull,
      );
      expect(
        _error(422, {
          'code': 'location_outside_service_area',
          'pointType': 'moon',
        }).pointTypeDetail,
        isNull,
      );
    });

    test('deadline_passed_before_payment (409) with deadlineAt', () {
      final e = _error(409, {
        'code': 'deadline_passed_before_payment',
        'deadlineAt': '2026-10-19T20:59:00.000Z',
      });
      expect(e.deadlineProblem, DeadlineProblem.passedBeforePayment);
      expect(e.deadlineAt, DateTime.utc(2026, 10, 19, 20, 59));
      expect(e.isLocationOutsideServiceArea, isFalse);
    });

    test('deadline_not_editable (409) with status', () {
      final e = _error(409, {
        'code': 'deadline_not_editable',
        'status': 'PAYMENT_CONFIRMED',
      });
      expect(e.deadlineProblem, DeadlineProblem.notEditable);
      expect(e.statusDetail, ErrandStatus.paymentConfirmed);
      expect(
        _error(409, {
          'code': 'deadline_not_editable',
          'status': 'X',
        }).statusDetail,
        isNull,
      );
    });

    test('deadline_in_past (400) and deadline_customer_only (403)', () {
      expect(
        _error(400, {'code': 'deadline_in_past'}).deadlineProblem,
        DeadlineProblem.inPast,
      );
      final forbidden = _error(403, {'code': 'deadline_customer_only'});
      expect(forbidden.statusCode, 403);
      expect(forbidden.deadlineProblem, DeadlineProblem.customerOnly);
      expect(forbidden.isUnauthorized, isFalse);
    });

    test('other codes map to no deadline problem', () {
      expect(_error(409, {'code': 'quote_expired'}).deadlineProblem, isNull);
      expect(_error(500, {}).deadlineProblem, isNull);
      expect(DeadlineProblem.fromCode(null), isNull);
    });
  });
}
