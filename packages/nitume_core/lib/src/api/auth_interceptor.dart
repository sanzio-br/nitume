import 'package:dio/dio.dart';

import '../models/auth_tokens.dart';
import '../storage/token_store.dart';

/// Attaches the access token to every request and transparently refreshes it
/// once on a `401`, retrying the original request.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this._tokenStore,
    required this._refreshTokens,
    this._onUnauthenticated,
  });

  final TokenStore _tokenStore;
  final Future<AuthTokens?> Function(String refreshToken) _refreshTokens;
  final void Function()? _onUnauthenticated;

  Future<AuthTokens?>? _refreshInFlight;

  /// Public endpoints that must never receive a token and never trigger a
  /// token refresh on `401` (which would otherwise clear a valid session
  /// while signing in).
  static bool _isPublicPath(String path) {
    final lower = path.toLowerCase();
    return lower.startsWith('/auth/');
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isPublicPath(options.path)) {
      final publicHeaders = Map<String, dynamic>.from(options.headers)
        ..remove('Authorization');
      options.headers = publicHeaders;
      return handler.next(options);
    }

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

    // Public endpoints surface their own 401 (e.g. invalid OTP code) —
    // never refresh or clear a session for them.
    if (_isPublicPath(options.path)) {
      return handler.next(err);
    }

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

      // Retry the original request with the new token
      // Clone the original options and create a new Dio with the same config
      final retryOptions = Options(
        method: options.method,
        headers: options.headers,
        responseType: options.responseType,
        contentType: options.contentType,
        validateStatus: options.validateStatus,
        sendTimeout: options.sendTimeout,
        receiveTimeout: options.receiveTimeout,
      );
      
      final retryDio = Dio(BaseOptions(
        baseUrl: options.baseUrl,
        connectTimeout: options.connectTimeout,
        receiveTimeout: options.receiveTimeout,
        sendTimeout: options.sendTimeout,
        headers: options.headers,
      ));
      
      final response = await retryDio.request<dynamic>(
        options.path,
        data: options.data,
        queryParameters: options.queryParameters,
        options: retryOptions,
      );
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