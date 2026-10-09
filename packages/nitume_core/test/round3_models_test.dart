import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    calls.add(key);
    final (status, body) = routes[key] ?? (404, {'message': 'Not found'});
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

ErrandRepository _repo(_Adapter a) => ErrandRepository(
  NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: InMemoryTokenStore(),
    httpClientAdapter: a,
  ),
);

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

const _quote = {
  'id': 'q2',
  'errandId': 'e1',
  'total': '2500.00',
  'currency': 'KES',
  'expiresAt': '2026-10-09T12:00:00.000Z',
};

const _history = {
  'id': 'h1',
  'errandId': 'e1',
  'fromStatus': 'QUOTED',
  'toStatus': 'ACCEPTED',
  'actorType': 'customer',
};

void main() {
  test('Errand reads quoteAcceptanceRequired and quoteExpiresAt', () {
    final e = Errand.fromJson(
      _errand('ACCEPTED', {
        'quoteAcceptanceRequired': true,
        'quoteExpiresAt': '2026-10-09T12:00:00.000Z',
      }),
    );
    expect(e.quoteAcceptanceRequired, isTrue);
    expect(e.quoteExpiresAt, DateTime.utc(2026, 10, 9, 12));
    final old = Errand.fromJson(_errand('QUOTED'));
    expect(old.quoteAcceptanceRequired, isFalse);
    expect(old.quoteExpiresAt, isNull);
  });

  group('acceptQuote (row 72)', () {
    test('posts to quote/accept and returns errand + quote', () async {
      final a = _Adapter({
        'POST /errands/e1/quote/accept': (
          200,
          {
            'errand': _errand('ACCEPTED', {'quoteAcceptanceRequired': false}),
            'quote': _quote,
          },
        ),
      });
      final r = await _repo(a).acceptQuote('e1');
      expect(a.calls, ['POST /errands/e1/quote/accept']);
      expect(r.errand.status, ErrandStatus.accepted);
      expect(r.quote!.id, 'q2');
      expect(r.quote!.total, '2500.00');
    });

    test('coded failures are rethrown', () async {
      final a = _Adapter({
        'POST /errands/e1/quote/accept': (
          409,
          {
            'statusCode': 409,
            'code': 'quote_not_acceptable',
            'message': 'A quote cannot be accepted while the task is CANCELLED',
            'status': 'CANCELLED',
          },
        ),
      });
      await expectLater(
        _repo(a).acceptQuote('e1', fallbackToTransition: true),
        throwsA(
          isA<NitumeApiException>()
              .having((e) => e.code, 'code', ApiErrorCodes.quoteNotAcceptable)
              .having((e) => e.details['status'], 'status', 'CANCELLED'),
        ),
      );
      expect(a.calls, hasLength(1));
    });

    test('fallback: QUOTED transitions, ACCEPTED needs nothing', () async {
      final quoted = _Adapter({
        'GET /errands/e1': (200, _errand('QUOTED')),
        'PATCH /errands/e1/status': (
          200,
          {'errand': _errand('ACCEPTED'), 'history': _history},
        ),
      });
      final r = await _repo(quoted)
          .acceptQuote('e1', fallbackToTransition: true);
      expect(r.errand.status, ErrandStatus.accepted);
      expect(r.quote, isNull);
      expect(quoted.calls.last, 'PATCH /errands/e1/status');

      final accepted = _Adapter({
        'GET /errands/e1': (200, _errand('ACCEPTED')),
      });
      final s = await _repo(accepted)
          .acceptQuote('e1', fallbackToTransition: true);
      expect(s.errand.status, ErrandStatus.accepted);
      expect(accepted.calls, [
        'POST /errands/e1/quote/accept',
        'GET /errands/e1',
      ]);
    });

    test('without fallback a missing endpoint is an error', () async {
      await expectLater(
        _repo(_Adapter({})).acceptQuote('e1'),
        throwsA(isA<NitumeApiException>()),
      );
    });
  });

  test('refunds lists every review with trigger and request id', () async {
    final a = _Adapter({
      'GET /errands/e1/refunds': (
        200,
        {
          'items': [
            {
              'id': 'r2',
              'errandId': 'e1',
              'trigger': 'price_change_decrease',
              'priceChangeRequestId': 'pc1',
              'status': 'approved',
              'amountPaid': '300.00',
              'refundAmount': '300.00',
              'payoutReference': null,
            },
            {'id': 'r1', 'status': 'unknown_status'},
            {
              'id': 'r0',
              'errandId': 'e1',
              'trigger': 'price_change_rejected',
              'priceChangeRequestId': null,
              'status': 'pending_review',
            },
          ],
        },
      ),
      'GET /errands/e2/refunds': (200, {'items': []}),
    });
    final list = await _repo(a).refunds('e1');
    expect(list.map((r) => r.id), ['r2', 'r0']);
    expect(list.first.trigger, RefundTrigger.priceChangeDecrease);
    expect(list.first.priceChangeRequestId, 'pc1');
    expect(list.last.priceChangeRequestId, isNull);
    expect(await _repo(a).refunds('e2'), isEmpty);
  });

  test('Payment.priceChangeRequestId', () {
    final p = Payment.fromJson({
      'id': 'p2',
      'errandId': 'e1',
      'serviceFee': '0.00',
      'runnerFee': '0.00',
      'merchantAmount': '300.00',
      'paymentFlow': 'customer_to_runner',
      'status': 'pending',
      'priceChangeRequestId': 'pc1',
    });
    expect(p.priceChangeRequestId, 'pc1');
  });

  test('round-3 error codes', () {
    expect(ApiErrorCodes.quoteNotAccepted, 'quote_not_accepted');
    expect(ApiErrorCodes.quoteNotAcceptable, 'quote_not_acceptable');
    expect(ApiErrorCodes.paymentInProgress, 'payment_in_progress');
    expect(ApiErrorCodes.illegalTransition, 'illegal_transition');
    expect(ApiErrorCodes.concurrentModification, 'concurrent_modification');
    expect(ApiErrorCodes.errandNotQuoted, 'errand_not_quoted');
    expect(ApiErrorCodes.ratingAlreadyExists, 'rating_already_exists');
    expect(ApiErrorCodes.phoneAlreadyRegistered, 'phone_already_registered');
  });
}
