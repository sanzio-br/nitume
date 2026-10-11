import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final calls = <String>[];
  final bodies = <Object?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    calls.add(key);
    bodies.add(options.data);
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

Map<String, dynamic> _errand([Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'buy_for_me',
  'description': 'Buy a gas refill',
  'status': 'QUOTED',
  'urgency': 'standard',
  'budget': '3000.00',
  ...?extra,
};

void main() {
  group('requestNewQuote (row 68)', () {
    test('posts to quote/request and returns the errand', () async {
      final a = _Adapter({
        'POST /errands/e1/quote/request': (
          200,
          _errand({'quoteRequestedAt': '2026-10-09T13:45:00.000Z'}),
        ),
      });
      final e = await _repo(a).requestNewQuote('e1');
      expect(a.calls, ['POST /errands/e1/quote/request']);
      expect(e.quoteRequestPending, isTrue);
      expect(e.quoteRequestedAt, DateTime.utc(2026, 10, 9, 13, 45));
    });

    test('quote_request_pending is a success: the errand is re-read', () async {
      final a = _Adapter({
        'POST /errands/e1/quote/request': (
          409,
          {
            'statusCode': 409,
            'code': 'quote_request_pending',
            'message': 'A new quote has already been requested for this task',
            'quoteRequestedAt': '2026-10-09T13:00:00.000Z',
          },
        ),
        'GET /errands/e1': (
          200,
          _errand({'quoteRequestedAt': '2026-10-09T13:00:00.000Z'}),
        ),
      });
      final e = await _repo(a).requestNewQuote('e1');
      expect(a.calls, ['POST /errands/e1/quote/request', 'GET /errands/e1']);
      expect(e.quoteRequestedAt, DateTime.utc(2026, 10, 9, 13));
    });

    for (final code in [
      ApiErrorCodes.quoteStillValid,
      ApiErrorCodes.quoteRequestNotAllowed,
    ]) {
      test('$code is rethrown', () async {
        final a = _Adapter({
          'POST /errands/e1/quote/request': (
            409,
            {'statusCode': 409, 'code': code, 'message': 'No'},
          ),
        });
        await expectLater(
          _repo(a).requestNewQuote('e1'),
          throwsA(
            isA<NitumeApiException>().having((e) => e.code, 'code', code),
          ),
        );
        expect(a.calls, hasLength(1));
      });
    }
  });

  group('CreateErrandRequest title', () {
    CreateErrandRequest request({String? title}) => CreateErrandRequest(
      category: ErrandCategory.buyForMe,
      description: 'Buy a gas refill',
      budget: 3000,
      locations: const [],
      title: title,
    );

    test('sends a trimmed title', () {
      expect(request(title: '  Gas refill  ').toJson()['title'], 'Gas refill');
    });

    test('omits a missing or blank title', () {
      expect(request().toJson().containsKey('title'), isFalse);
      expect(request(title: '   ').toJson().containsKey('title'), isFalse);
    });

    test('create posts the title', () async {
      final a = _Adapter({
        'POST /errands': (
          201,
          {
            'errand': _errand({'status': 'DRAFT', 'title': 'Gas refill'}),
            'history': {
              'id': 'h1',
              'errandId': 'e1',
              'fromStatus': null,
              'toStatus': 'DRAFT',
              'actorType': 'customer',
            },
          },
        ),
      });
      final r = await _repo(a).create(request(title: 'Gas refill'));
      expect((a.bodies.single as Map)['title'], 'Gas refill');
      expect(r.errand.title, 'Gas refill');
    });
  });
}
