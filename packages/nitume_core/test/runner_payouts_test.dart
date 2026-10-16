import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// Replays queued responses per `METHOD path?query`; a `null` body with
/// status 0 simulates a connection error.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, List<(int, Object?)>> routes;
  final calls = <String>[];
  final bodies = <Object?>[];
  final headers = <Map<String, dynamic>>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final query = options.uri.query;
    final key =
        '${options.method} ${options.path}${query.isEmpty ? '' : '?$query'}';
    calls.add(key);
    bodies.add(options.data);
    headers.add(Map.of(options.headers));
    final queue = routes[key];
    final (status, body) = queue == null || queue.isEmpty
        ? (404, {'message': 'Not found'})
        : (queue.length == 1 ? queue.first : queue.removeAt(0));
    if (status == 0) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'offline',
      );
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: const {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

NitumeApiClient _client(_Adapter a) => NitumeApiClient(
  config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
  tokenStore: InMemoryTokenStore(),
  httpClientAdapter: a,
);

const _request = {
  'id': 'pr1',
  'requestedAmount': '2500.00',
  'paidAmount': null,
  'status': 'requested',
  'destinationPhone': '+254733111222',
  'createdAt': '2026-10-16T07:00:00.000Z',
  'decidedAt': null,
  'paidAt': null,
  'reference': null,
  'decisionNote': null,
};

void main() {
  group('RunnerPayoutRequest', () {
    test('parses an open request', () {
      final r = RunnerPayoutRequest.fromJson(_request);
      expect(r.id, 'pr1');
      expect(r.requestedAmount, '2500.00');
      expect(r.paidAmount, isNull);
      expect(r.status, RunnerPayoutRequestStatus.requested);
      expect(r.isOpen, isTrue);
      expect(r.destinationPhone, '+254733111222');
      expect(r.createdAt, DateTime.utc(2026, 10, 16, 7));
      expect(r.cancelledAt, isNull);
      expect(r.cancellationReason, isNull);
    });

    test('paid below the request keeps both amounts (row 146)', () {
      final r = RunnerPayoutRequest.fromJson({
        ..._request,
        'status': 'paid',
        'paidAmount': 1750,
        'decidedAt': '2026-10-16T09:00:00.000Z',
        'paidAt': '2026-10-16T09:00:00.000Z',
        'reference': 'SJK2X9ABCD',
      });
      expect(r.status, RunnerPayoutRequestStatus.paid);
      expect(r.requestedAmount, '2500.00');
      expect(r.paidAmount, '1750.00');
      expect(r.reference, 'SJK2X9ABCD');
      expect(r.paidAt, isNotNull);
      expect(r.isOpen, isFalse);
    });

    test('rejected carries the decision note', () {
      final r = RunnerPayoutRequest.fromJson({
        ..._request,
        'status': 'rejected',
        'decisionNote': 'Receipt pending',
      });
      expect(r.status, RunnerPayoutRequestStatus.rejected);
      expect(r.decisionNote, 'Receipt pending');
    });

    test('cancelled (row 166) with its optional fields', () {
      final r = RunnerPayoutRequest.fromJson({
        ..._request,
        'status': 'cancelled',
        'cancelledAt': '2026-10-17T06:00:00.000Z',
        'cancellationReason': 'Phone changed',
      });
      expect(r.status, RunnerPayoutRequestStatus.cancelled);
      expect(r.cancelledAt, DateTime.utc(2026, 10, 17, 6));
      expect(r.cancellationReason, 'Phone changed');
    });

    test('unknown status parses as null and keeps the wire value', () {
      final r = RunnerPayoutRequest.fromJson({
        ..._request,
        'status': 'on_review',
        'cancellationReason': '  ',
      });
      expect(r.status, isNull);
      expect(r.statusWire, 'on_review');
      expect(r.isOpen, isFalse);
      expect(r.cancellationReason, isNull);
    });
  });

  group('PayoutRequestSummary', () {
    test('parses with and without an open request', () {
      final none = PayoutRequestSummary.fromJson({
        'minimumAmount': '500.00',
        'availableAmount': '3200.00',
        'openRequest': null,
      });
      expect(none.minimumAmount, '500.00');
      expect(none.availableAmount, '3200.00');
      expect(none.hasOpenRequest, isFalse);

      final open = PayoutRequestSummary.fromJson({
        'minimumAmount': 500,
        'availableAmount': '3200.00',
        'openRequest': {
          'id': 'pr1',
          'requestedAmount': '2500.00',
          'status': 'requested',
          'createdAt': '2026-10-16T07:00:00.000Z',
        },
      });
      expect(open.minimumAmount, '500.00');
      expect(open.openRequest!.id, 'pr1');
      expect(open.openRequest!.status, RunnerPayoutRequestStatus.requested);
      expect(open.openRequest!.requestedAmount, '2500.00');
    });

    test('check mirrors the API rules', () {
      const s = PayoutRequestSummary(
        minimumAmount: '500.00',
        availableAmount: '3200.50',
      );
      expect(s.check(500), isNull);
      expect(s.check(3200.50), isNull);
      expect(s.check(499.99), PayoutAmountProblem.belowMinimum);
      expect(s.check(0), PayoutAmountProblem.belowMinimum);
      expect(s.check(3200.51), PayoutAmountProblem.exceedsAvailable);

      final open = PayoutRequestSummary(
        minimumAmount: '500.00',
        availableAmount: '3200.00',
        openRequest: OpenPayoutRequest.fromJson({
          'id': 'pr1',
          'requestedAmount': '1000.00',
          'status': 'requested',
        }),
      );
      expect(open.check(1000), PayoutAmountProblem.requestOpen);
    });
  });

  group('PayoutFeedItem', () {
    test('payout entry carries payoutRequestId and requestedAmount', () {
      final i = PayoutFeedItem.fromJson({
        'id': 'payout:l1',
        'kind': 'payout',
        'status': 'paid',
        'amount': '-1750.00',
        'errandId': null,
        'errandTitle': null,
        'errandReference': null,
        'reference': 'SJK2X9ABCD',
        'relatedLineId': null,
        'lineIds': ['l1', 'l2'],
        'reviewReason': null,
        'createdAt': '2026-10-16T09:00:00.000Z',
        'payableAt': null,
        'paidAt': '2026-10-16T09:00:00.000Z',
        'payoutRequestId': 'pr1',
        'requestedAmount': '2500.00',
      });
      expect(i.kind, PayoutFeedKind.payout);
      expect(i.status, PayoutLineStatus.paid);
      expect(i.amount, '-1750.00');
      expect(i.lineIds, ['l1', 'l2']);
      expect(i.payoutRequestId, 'pr1');
      expect(i.requestedAmount, '2500.00');
      expect(i.reference, 'SJK2X9ABCD');
    });

    test('job line on hold; absent request fields are null', () {
      final i = PayoutFeedItem.fromJson({
        'id': 'l3',
        'kind': 'item_reimbursement',
        'status': 'on_hold',
        'amount': 1200,
        'errandId': 'e1',
        'errandTitle': 'Buy groceries',
        'errandReference': 'NT-1001',
        'reviewReason': 'over_purchase_limit',
        'createdAt': '2026-10-15T09:00:00.000Z',
      });
      expect(i.kind, PayoutFeedKind.itemReimbursement);
      expect(i.status, PayoutLineStatus.onHold);
      expect(i.amount, '1200.00');
      expect(i.errandTitle, 'Buy groceries');
      expect(i.reviewReason, PayoutReviewReason.overPurchaseLimit);
      expect(i.lineIds, isEmpty);
      expect(i.payoutRequestId, isNull);
      expect(i.requestedAmount, isNull);
    });

    test('unknown kind, status and reason parse as null', () {
      final i = PayoutFeedItem.fromJson({
        'id': 'x',
        'kind': 'bonus',
        'status': 'frozen',
        'amount': '10.00',
        'reviewReason': 'other',
      });
      expect(i.kind, isNull);
      expect(i.kindWire, 'bonus');
      expect(i.status, isNull);
      expect(i.reviewReason, isNull);
    });

    test('every wire value round-trips', () {
      for (final k in PayoutFeedKind.values) {
        expect(PayoutFeedKind.tryFromWire(k.wire), k);
      }
      for (final s in PayoutLineStatus.values) {
        expect(PayoutLineStatus.tryFromWire(s.wire), s);
      }
      for (final r in PayoutReviewReason.values) {
        expect(PayoutReviewReason.tryFromWire(r.wire), r);
      }
      for (final s in RunnerPayoutRequestStatus.values) {
        expect(RunnerPayoutRequestStatus.tryFromWire(s.wire), s);
      }
    });
  });

  group('RunnerPayoutRepository', () {
    RunnerPayoutRepository repo(
      _Adapter a,
      IdempotencyKeyStore store, {
      List<String>? keys,
    }) {
      final queue = [...?keys];
      return RunnerPayoutRepository(
        _client(a),
        keys: PaymentAttemptKeys(
          store,
          newKey: queue.isEmpty ? null : () => queue.removeAt(0),
        ),
      );
    }

    test('summary', () async {
      final a = _Adapter({
        'GET /runners/me/payout-requests/summary': [
          (
            200,
            {
              'minimumAmount': '500.00',
              'availableAmount': '3200.00',
              'openRequest': null,
            },
          ),
        ],
      });
      final s = await repo(a, InMemoryIdempotencyKeyStore()).summary();
      expect(s.availableAmount, '3200.00');
      expect(s.openRequest, isNull);
    });

    test('requests pages with a cursor', () async {
      final a = _Adapter({
        'GET /runners/me/payout-requests': [
          (
            200,
            {
              'items': [_request],
              'nextCursor': 'c1',
            },
          ),
        ],
        'GET /runners/me/payout-requests?cursor=c1&limit=10': [
          (200, {'items': <Object>[], 'nextCursor': null}),
        ],
      });
      final r = repo(a, InMemoryIdempotencyKeyStore());
      final first = await r.requests();
      expect(first.items.single.id, 'pr1');
      expect(first.hasMore, isTrue);
      final second = await r.requests(cursor: first.nextCursor, limit: 10);
      expect(second.items, isEmpty);
      expect(second.hasMore, isFalse);
    });

    test(
      'requestPayout sends the amount and a stored key, then drops it',
      () async {
        final a = _Adapter({
          'POST /runners/me/payout-requests': [(201, _request)],
        });
        final store = InMemoryIdempotencyKeyStore();
        final r = repo(a, store, keys: ['key-one-123', 'key-two-123']);
        final created = await r.requestPayout(2500);
        expect(created.id, 'pr1');
        expect(a.bodies.single, {'amount': 2500});
        expect(a.headers.single['Idempotency-Key'], 'key-one-123');
        expect(
          await store.read(RunnerPayoutRepository.idempotencyScope),
          isNull,
        );
      },
    );

    test('a network error keeps the key for the retry', () async {
      final a = _Adapter({
        'POST /runners/me/payout-requests': [(0, null), (201, _request)],
      });
      final store = InMemoryIdempotencyKeyStore();
      final r = repo(a, store, keys: ['key-one-123', 'key-two-123']);
      await expectLater(
        r.requestPayout(2500),
        throwsA(
          isA<NitumeApiException>().having(
            (e) => e.isNetworkError,
            'isNetworkError',
            isTrue,
          ),
        ),
      );
      expect(
        await store.read(RunnerPayoutRepository.idempotencyScope),
        'key-one-123',
      );
      // A new repository (app restart) reuses the same key.
      final again = repo(a, store, keys: ['key-three-123']);
      await again.requestPayout(2500);
      expect(a.headers.last['Idempotency-Key'], 'key-one-123');
    });

    test('a 4xx refusal drops the key and exposes the details', () async {
      final a = _Adapter({
        'POST /runners/me/payout-requests': [
          (
            400,
            {
              'statusCode': 400,
              'code': 'payout_below_minimum',
              'message': 'The minimum payout is KSh 500.00',
              'minimumAmount': '500.00',
            },
          ),
          (
            400,
            {
              'statusCode': 400,
              'code': 'payout_exceeds_available',
              'message': 'You can request up to KSh 3200.00',
              'availableAmount': '3200.00',
            },
          ),
          (
            409,
            {
              'statusCode': 409,
              'code': 'payout_request_open',
              'message': 'You already have a payout request open',
              'requestId': 'pr1',
            },
          ),
        ],
      });
      final store = InMemoryIdempotencyKeyStore();
      final r = repo(
        a,
        store,
        keys: ['key-one-123', 'key-two-123', 'k3-1234567'],
      );
      try {
        await r.requestPayout(100);
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, ApiErrorCodes.payoutBelowMinimum);
        expect(e.minimumAmount, '500.00');
      }
      try {
        await r.requestPayout(9000);
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, ApiErrorCodes.payoutExceedsAvailable);
        expect(e.availableAmount, '3200.00');
      }
      try {
        await r.requestPayout(1000);
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, ApiErrorCodes.payoutRequestOpen);
        expect(e.details['requestId'], 'pr1');
      }
      expect(
        [for (final h in a.headers) h['Idempotency-Key']],
        ['key-one-123', 'key-two-123', 'k3-1234567'],
      );
      expect(await store.read(RunnerPayoutRepository.idempotencyScope), isNull);
    });

    test('a 5xx keeps the key', () async {
      final a = _Adapter({
        'POST /runners/me/payout-requests': [
          (500, {'statusCode': 500, 'message': 'boom'}),
        ],
      });
      final store = InMemoryIdempotencyKeyStore();
      final r = repo(a, store, keys: ['key-one-123']);
      await expectLater(
        r.requestPayout(600),
        throwsA(isA<NitumeApiException>()),
      );
      expect(
        await store.read(RunnerPayoutRepository.idempotencyScope),
        'key-one-123',
      );
    });

    test('requestPayout rejects a non-positive amount locally', () {
      final r = repo(_Adapter({}), InMemoryIdempotencyKeyStore());
      expect(() => r.requestPayout(0), throwsArgumentError);
    });

    test('payout_destination_missing code', () {
      expect(
        ApiErrorCodes.payoutDestinationMissing,
        'payout_destination_missing',
      );
    });

    test('payoutLines filters by kind, errand and cursor', () async {
      final a = _Adapter({
        'GET /runners/me/payout-lines?kind=payout%2Cresent_payout&cursor=c1&limit=20':
            [
              (
                200,
                {
                  'items': [
                    {
                      'id': 'payout:l1',
                      'kind': 'payout',
                      'status': 'paid',
                      'amount': '-1750.00',
                      'lineIds': ['l1'],
                      'payoutRequestId': 'pr1',
                      'requestedAmount': '2500.00',
                    },
                  ],
                  'nextCursor': null,
                },
              ),
            ],
        'GET /runners/me/payout-lines?errandId=e1': [
          (200, {'items': <Object>[], 'nextCursor': null}),
        ],
      });
      final r = repo(a, InMemoryIdempotencyKeyStore());
      final page = await r.payoutLines(
        kinds: {PayoutFeedKind.payout, PayoutFeedKind.resentPayout},
        cursor: 'c1',
        limit: 20,
      );
      expect(page.items.single.payoutRequestId, 'pr1');
      expect(page.hasMore, isFalse);
      final one = await r.payoutLines(errandId: 'e1');
      expect(one.items, isEmpty);
    });
  });
}
