import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:nitume_core/nitume_core.dart';

/// Routes `'<METHOD> <path>[?query]'` to `(status, body)`; records calls,
/// bodies and query parameters. Unknown routes answer 404.
class FakeApiAdapter implements HttpClientAdapter {
  FakeApiAdapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final calls = <String>[];
  final bodies = <Object?>[];

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

NitumeApiClient fakeClient(FakeApiAdapter a) => NitumeApiClient(
  config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
  tokenStore: InMemoryTokenStore(),
  httpClientAdapter: a,
);
