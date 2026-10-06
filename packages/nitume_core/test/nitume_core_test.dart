import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_core/src/api/auth_interceptor.dart';

/// Adapter that always answers `401` with a NestJS-style error body.
class _UnauthorizedAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final body = utf8.encode(
      jsonEncode({'message': 'Invalid OTP code', 'statusCode': 401}),
    );
    return ResponseBody(
      Stream.value(Uint8List.fromList(body)),
      401,
      headers: const {'content-type': ['application/json']},
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('AuthInterceptor', () {
    test('public /auth/* requests drop the Authorization header', () async {
      final store = InMemoryTokenStore();
      await store.write(
        const AuthTokens(accessToken: 'access', refreshToken: 'refresh'),
      );
      final interceptor = AuthInterceptor(
        tokenStore: store,
        refreshTokens: (_) async => null,
      );

      final options = RequestOptions(
        method: 'POST',
        baseUrl: 'https://api.example.com',
        path: '/auth/otp/verify',
        headers: const {'Authorization': 'Bearer stale'},
      );

      await interceptor.onRequest(options, RequestInterceptorHandler());

      expect(options.headers.containsKey('Authorization'), isFalse);
    });

    test('secures requests with a stored token', () async {
      final store = InMemoryTokenStore();
      await store.write(
        const AuthTokens(accessToken: 'access', refreshToken: 'refresh'),
      );
      final interceptor = AuthInterceptor(
        tokenStore: store,
        refreshTokens: (_) async => null,
      );

      final options = RequestOptions(
        method: 'GET',
        baseUrl: 'https://api.example.com',
        path: '/errands/mine',
      );

      await interceptor.onRequest(options, RequestInterceptorHandler());

      expect(options.headers['Authorization'], 'Bearer access');
    });

    test('a 401 on a public path never refreshes or clears the session',
        () async {
      final store = InMemoryTokenStore();
      await store.write(
        const AuthTokens(accessToken: 'access', refreshToken: 'refresh'),
      );
      var refreshed = false;
      final interceptor = AuthInterceptor(
        tokenStore: store,
        refreshTokens: (_) async {
          refreshed = true;
          return null;
        },
      );

      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'))
        ..interceptors.add(interceptor)
        ..httpClientAdapter = _UnauthorizedAdapter();

      await expectLater(
        dio.post<dynamic>('/auth/otp/verify', data: {'code': '000000'}),
        throwsA(isA<DioException>()),
      );

      expect(refreshed, isFalse, reason: 'refresh must not run on public paths');
      expect(await store.read(), isNotNull,
          reason: 'a stale OTP attempt must not wipe a valid session');
    });
  });
}