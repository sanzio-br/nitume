import 'package:dio/dio.dart';

import '../models/auth_tokens.dart';
import 'api_exception.dart';
import '../storage/token_store.dart';

/// Attaches the access token to every request and transparently refreshes it
/// once on a `401`, retrying the original request.
///
/// When the API refuses the session with `account_suspended` (on a call or
/// on the refresh) the session is cleared and [_onAccountSuspended] runs
/// instead of [_onUnauthenticated] (falls back to it when not set).
///
/// [_beforeSessionCleared] runs before the tokens are cleared, while they
/// still work (e.g. to unregister the push device, `_shared.md` §7). It is
/// best effort: bounded by [beforeClearTimeout], errors are ignored, and a
/// clear triggered by the hook's own request skips it.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this._tokenStore,
    required this._refreshTokens,
    this._onUnauthenticated,
    this._onAccountSuspended,
    this._beforeSessionCleared,
  });

  /// Upper bound for the before-clear hook.
  static const beforeClearTimeout = Duration(seconds: 5);

  final TokenStore _tokenStore;
  final Future<AuthTokens?> Function(String refreshToken) _refreshTokens;
  final void Function()? _onUnauthenticated;
  final void Function()? _onAccountSuspended;
  final Future<void> Function()? _beforeSessionCleared;
  bool _runningBeforeClear = false;

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

    if (_isSuspended(err)) {
      await _failSession(suspended: true);
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

      final retryDio = Dio(
        BaseOptions(
          baseUrl: options.baseUrl,
          connectTimeout: options.connectTimeout,
          receiveTimeout: options.receiveTimeout,
          sendTimeout: options.sendTimeout,
          headers: options.headers,
        ),
      );

      final response = await retryDio.request<dynamic>(
        options.path,
        data: options.data,
        queryParameters: options.queryParameters,
        options: retryOptions,
      );
      handler.resolve(response);
    } on NitumeApiException catch (e) {
      await _failSession(suspended: e.isAccountSuspended);
      handler.next(err);
    } on DioException catch (e) {
      await _failSession(suspended: _isSuspended(e));
      handler.next(err);
    } catch (_) {
      await _failSession();
      handler.next(err);
    }
  }

  static bool _isSuspended(DioException err) {
    final data = err.response?.data;
    return data is Map && data['code'] == ApiErrorCodes.accountSuspended;
  }

  Future<void> _failSession({bool suspended = false}) async {
    final hook = _beforeSessionCleared;
    if (hook != null && !_runningBeforeClear) {
      _runningBeforeClear = true;
      try {
        await hook().timeout(beforeClearTimeout);
      } on Object {
        // Never block ending the session.
      } finally {
        _runningBeforeClear = false;
      }
    }
    await _tokenStore.clear();
    final suspendedHook = _onAccountSuspended;
    if (suspended && suspendedHook != null) {
      suspendedHook();
    } else {
      _onUnauthenticated?.call();
    }
  }
}
