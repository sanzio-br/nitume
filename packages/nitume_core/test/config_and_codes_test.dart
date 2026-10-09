import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    paths.add(key);
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

const _suspended = {
  'statusCode': 401,
  'code': 'account_suspended',
  'message': 'Account is suspended or banned',
};

Future<({NitumeApiClient api, InMemoryTokenStore store, List<String> calls})>
_signedIn(_Adapter adapter) async {
  final store = InMemoryTokenStore();
  await store.write(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
  final calls = <String>[];
  final api = NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: store,
    httpClientAdapter: adapter,
    onUnauthenticated: () => calls.add('unauthenticated'),
    onAccountSuspended: () => calls.add('suspended'),
  );
  return (api: api, store: store, calls: calls);
}

void main() {
  group('account_suspended', () {
    test(
      'a coded call ends the session as suspended without a refresh',
      () async {
        final adapter = _Adapter({'GET /errands/e1': (401, _suspended)});
        final s = await _signedIn(adapter);

        await expectLater(
          s.api.getMap('/errands/e1'),
          throwsA(
            isA<NitumeApiException>()
                .having((e) => e.isAccountSuspended, 'suspended', isTrue)
                .having((e) => e.isUnauthorized, 'unauthorized', isFalse),
          ),
        );
        expect(s.calls, ['suspended']);
        expect(await s.store.read(), isNull);
        expect(adapter.paths, isNot(contains('POST /auth/refresh')));
      },
    );

    test(
      'a refresh refused as suspended ends the session as suspended',
      () async {
        final adapter = _Adapter({
          'GET /errands/e1': (401, {'statusCode': 401, 'message': 'expired'}),
          'POST /auth/refresh': (401, _suspended),
        });
        final s = await _signedIn(adapter);

        await expectLater(
          s.api.getMap('/errands/e1'),
          throwsA(isA<NitumeApiException>()),
        );
        expect(s.calls, ['suspended']);
        expect(await s.store.read(), isNull);
      },
    );

    test('a plain refresh failure stays a normal session expiry', () async {
      final adapter = _Adapter({
        'GET /errands/e1': (401, {'statusCode': 401, 'message': 'expired'}),
        'POST /auth/refresh': (401, {'statusCode': 401, 'message': 'bad'}),
      });
      final s = await _signedIn(adapter);

      await expectLater(
        s.api.getMap('/errands/e1'),
        throwsA(isA<NitumeApiException>()),
      );
      expect(s.calls, ['unauthenticated']);
    });
  });

  test('ApiErrorCodes match the API wire values', () {
    expect(ApiErrorCodes.quoteExpired, 'quote_expired');
    expect(ApiErrorCodes.accountSuspended, 'account_suspended');
    expect(
      ApiErrorCodes.priceChangeAlreadyDecided,
      'price_change_already_decided',
    );
    expect(
      ApiErrorCodes.priceChangeNotInProgress,
      'price_change_not_in_progress',
    );
    expect(ApiErrorCodes.differenceNotStk, 'difference_not_stk');
    expect(ApiErrorCodes.refundNotFound, 'refund_not_found');
  });

  test('quote preview is off by default (row 47)', () {
    expect(const AppConfig().quotePreviewEnabled, isFalse);
    expect(AppConfig.fromEnvironment().quotePreviewEnabled, isFalse);
    expect(
      const AppConfig(quotePreviewEnabled: true).quotePreviewEnabled,
      isTrue,
    );
  });

  test('openExternalLink never throws without a platform launcher', () async {
    expect(await openExternalLink(Uri.parse('https://nitume.test')), isFalse);
  });

  test('links are usable once an opener is supplied (row 39)', () async {
    final opened = <Uri>[];
    final config = AppConfig(
      termsUri: Uri.parse('https://nitume.test/terms'),
      supportUri: Uri.parse('tel:+254700000000'),
      onOpenLink: (u) async {
        opened.add(u);
        return true;
      },
    );
    expect(config.termsLink, Uri.parse('https://nitume.test/terms'));
    expect(config.privacyLink, isNull);
    expect(await config.open(config.supportLink!), isTrue);
    expect(opened.single.scheme, 'tel');
    expect(
      AppConfig(termsUri: Uri.parse('https://nitume.test/terms')).termsLink,
      isNull,
    );
  });
}
