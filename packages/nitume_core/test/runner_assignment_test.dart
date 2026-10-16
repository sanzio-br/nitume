import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

NitumeApiException _error(int status, Map<String, Object?> body) =>
    NitumeApiException.fromDio(
      DioException(
        requestOptions: RequestOptions(path: '/errands/e1/status'),
        response: Response(
          requestOptions: RequestOptions(path: '/errands/e1/status'),
          statusCode: status,
          data: body,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

void main() {
  final deadline = DateTime.utc(2026, 10, 16, 8, 10);

  group('ErrandAssignment', () {
    test('parses offerExpiresAt and an open offer', () {
      final a = ErrandAssignment.fromJson({
        'id': 'a1',
        'status': 'assigned',
        'assignedAt': '2026-10-16T08:00:00.000Z',
        'offerExpiresAt': '2026-10-16T08:10:00.000Z',
        'runner': null,
      });
      expect(a.status, AssignmentStatus.assigned);
      expect(a.offerExpiresAt, deadline);
      expect(
        a.offerTimeLeftAt(DateTime.utc(2026, 10, 16, 8, 4)),
        const Duration(minutes: 6),
      );
      expect(a.offerLapsedAt(DateTime.utc(2026, 10, 16, 8, 9, 59)), isFalse);
      expect(a.offerLapsedAt(deadline), isTrue);
      expect(
        a.offerTimeLeftAt(DateTime.utc(2026, 10, 16, 8, 11)),
        Duration.zero,
      );
    });

    test('accepted keeps the deadline for the record but never lapses', () {
      final a = ErrandAssignment.fromJson({
        'id': 'a1',
        'status': 'accepted',
        'assignedAt': '2026-10-16T08:00:00.000Z',
        'offerExpiresAt': '2026-10-16T08:10:00.000Z',
      });
      expect(a.status, AssignmentStatus.accepted);
      expect(a.offerExpiresAt, deadline);
      expect(a.offerLapsedAt(DateTime.utc(2026, 10, 17)), isFalse);
      expect(a.offerTimeLeftAt(DateTime.utc(2026, 10, 16, 8)), isNull);
    });

    test('expired status', () {
      final a = ErrandAssignment.fromJson({'id': 'a1', 'status': 'expired'});
      expect(a.status, AssignmentStatus.expired);
      expect(a.status!.isOpenOffer, isFalse);
    });

    test('no deadline (row 156): no countdown, never lapses', () {
      final a = ErrandAssignment.fromJson({
        'id': 'a1',
        'status': 'assigned',
        'offerExpiresAt': null,
      });
      expect(a.offerExpiresAt, isNull);
      expect(a.offerTimeLeftAt(DateTime.utc(2030)), isNull);
      expect(a.offerLapsedAt(DateTime.utc(2030)), isFalse);
    });

    test('unknown status parses as null', () {
      final a = ErrandAssignment.fromJson({'id': 'a1', 'status': 'paused'});
      expect(a.status, isNull);
      expect(a.offerLapsedAt(DateTime.utc(2030)), isFalse);
    });

    test('AssignmentStatus wire values round-trip', () {
      for (final s in AssignmentStatus.values) {
        expect(AssignmentStatus.tryFromWire(s.wire), s);
      }
      expect(AssignmentStatus.tryFromWire(null), isNull);
      expect(AssignmentStatus.offered.isOpenOffer, isTrue);
      expect(AssignmentStatus.assigned.isOpenOffer, isTrue);
      expect(AssignmentStatus.declined.isOpenOffer, isFalse);
    });
  });

  group('accept errors', () {
    test('offer_expired carries offerExpiresAt', () {
      final e = _error(409, {
        'statusCode': 409,
        'code': 'offer_expired',
        'message': 'Offer not accepted by 2026-10-16T08:10:00.000Z',
        'offerExpiresAt': '2026-10-16T08:10:00.000Z',
      });
      expect(e.code, ApiErrorCodes.offerExpired);
      expect(e.offerExpiresAt, deadline);
    });

    test('illegal_transition carries from and to', () {
      final e = _error(409, {
        'statusCode': 409,
        'code': 'illegal_transition',
        'message': 'Illegal status transition: EXPIRED -> RUNNER_EN_ROUTE',
        'from': 'EXPIRED',
        'to': 'RUNNER_EN_ROUTE',
      });
      expect(e.code, ApiErrorCodes.illegalTransition);
      expect(e.transitionFrom, ErrandStatus.expired);
      expect(e.transitionTo, ErrandStatus.runnerEnRoute);
    });

    test('missing or unknown details are null', () {
      final e = _error(409, {'statusCode': 409, 'code': 'illegal_transition'});
      expect(e.transitionFrom, isNull);
      expect(e.offerExpiresAt, isNull);
      expect(ErrandStatus.tryFromWire('NOPE'), isNull);
    });
  });
}
