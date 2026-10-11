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
    calls.add('$key ${options.headers['Authorization']}');
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

void main() {
  late InMemoryTokenStore store;
  late List<String> events;

  setUp(() async {
    store = InMemoryTokenStore();
    await store.write(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    events = [];
  });

  NitumeApiClient client(
    _Adapter adapter,
    Future<void> Function(NitumeApiClient api) hook,
  ) {
    late final NitumeApiClient api;
    api = NitumeApiClient(
      config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
      tokenStore: store,
      httpClientAdapter: adapter,
      onUnauthenticated: () => events.add('unauthenticated'),
      onAccountSuspended: () => events.add('suspended'),
      beforeSessionCleared: () => hook(api),
    );
    return api;
  }

  test('runs with the tokens still set, before the session ends', () async {
    final adapter = _Adapter({
      'GET /errands/e1': (401, _suspended),
      'DELETE /users/me/devices/d1': (204, null),
    });
    final api = client(adapter, (api) async {
      events.add('before clear, tokens ${(await store.read()) != null}');
      await api.delete('/users/me/devices/d1');
    });

    await expectLater(
      api.getMap('/errands/e1'),
      throwsA(isA<NitumeApiException>()),
    );
    expect(events, ['before clear, tokens true', 'suspended']);
    expect(adapter.calls, contains('DELETE /users/me/devices/d1 Bearer a'));
    expect(await store.read(), isNull);
  });

  test('a refused hook request does not re-enter the hook', () async {
    final adapter = _Adapter({
      'GET /errands/e1': (401, _suspended),
      'DELETE /users/me/devices/d1': (401, _suspended),
    });
    var runs = 0;
    final api = client(adapter, (api) async {
      runs++;
      await api.delete('/users/me/devices/d1');
    });

    await expectLater(
      api.getMap('/errands/e1'),
      throwsA(isA<NitumeApiException>()),
    );
    expect(runs, 1);
    expect(await store.read(), isNull);
    expect(events.last, 'suspended');
  });

  test('a failing hook never blocks ending the session', () async {
    final adapter = _Adapter({'GET /errands/e1': (401, _suspended)});
    final api = client(adapter, (_) async => throw StateError('offline'));

    await expectLater(
      api.getMap('/errands/e1'),
      throwsA(isA<NitumeApiException>()),
    );
    expect(events, ['suspended']);
    expect(await store.read(), isNull);
  });
}
