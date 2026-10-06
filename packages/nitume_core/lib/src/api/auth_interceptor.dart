import 'package:dio/dio.dart';

import '../models/auth_tokens.dart';
import '../storage/token_store.dart';

/// Attaches the access token to every request and transparently refreshes it
/// once on a `401`, retrying the original request.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this._dio,
    required TokenStore tokenStore,
    required this._refreshTokens,
    this._onUnauthenticated,
  }) : _tokenStore = tokenStore;

  final Dio _dio;
  final TokenStore _tokenStore;
  final Future<AuthTokens?> Function(String refreshToken) _refreshTokens;
  final void Function()? _onUnauthenticated;

  Future<AuthTokens?>? _refreshInFlight;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final tokens = await _tokenStore.read();
    if (tokens != null) {
      options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final status = err.response?.statusCode;
    final options = err.requestOptions;
    final alreadyRetried = options.extra['nitume.retried'] == true;

    if (status != 401 || alreadyRetried) {
      if (status == 401) await _failSession();
      return handler.next(err);
    }

    final tokens = await _tokenStore.read();
    if (tokens == null) {
      await _failSession();
      return handler.next(err);
    }

    try {
      final refreshed = await (_refreshInFlight ??=
          _refreshTokens(tokens.refreshToken).whenComplete(() {
            _refreshInFlight = null;
          }));
      if (refreshed == null) throw StateError('refresh returned no tokens');

      await _tokenStore.write(refreshed);
      options.extra['nitume.retried'] = true;
      options.headers['Authorization'] = 'Bearer ${refreshed.accessToken}';

      final response = await _dio.fetch<dynamic>(options);
      handler.resolve(response);
    } catch (_) {
      await _failSession();
      handler.next(err);
    }
  }

  Future<void> _failSession() async {
    await _tokenStore.clear();
    _onUnauthenticated?.call();
  }
}
