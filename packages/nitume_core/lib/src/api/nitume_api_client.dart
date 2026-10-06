import 'package:dio/dio.dart';

import '../models/auth_tokens.dart';
import '../storage/token_store.dart';
import 'api_config.dart';
import 'api_exception.dart';
import 'auth_interceptor.dart';

/// Thin, typed wrapper over [Dio] shared by the customer and runner apps.
///
/// All failures surface as [NitumeApiException]. Auth is handled transparently
/// by [AuthInterceptor]; `refresh`/`logout` intentionally bypass it to avoid
/// refresh loops.
class NitumeApiClient {
  NitumeApiClient({
    required ApiConfig config,
    required TokenStore tokenStore,
    void Function()? onUnauthenticated,
  }) {
    final options = BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: config.connectTimeout,
      receiveTimeout: config.receiveTimeout,
      sendTimeout: config.sendTimeout,
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
      headers: const {'Accept': 'application/json'},
    );
    _rawDio = Dio(options);
    _dio = Dio(options)
      ..interceptors.add(
        AuthInterceptor(
          dio: _dio,
          tokenStore: tokenStore,
          refreshTokens: refresh,
          onUnauthenticated: onUnauthenticated,
        ),
      );
  }

  late final Dio _rawDio;
  late final Dio _dio;

  String get baseUrl => _dio.options.baseUrl;

  /// Rotates the JWT pair. Does not require (or attach) an access token.
  Future<AuthTokens?> refresh(String refreshToken) async {
    try {
      final response = await _rawDio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = response.data;
      if (data is Map<String, dynamic>) return AuthTokens.fromJson(data);
      return null;
    } on DioException catch (error) {
      throw NitumeApiException.fromDio(error);
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _dio.get<dynamic>(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? data}) =>
      _send(() => _dio.post<dynamic>(path, data: data));

  Future<dynamic> patch(String path, {Object? data}) =>
      _send(() => _dio.patch<dynamic>(path, data: data));

  Future<dynamic> delete(String path, {Object? data}) =>
      _send(() => _dio.delete<dynamic>(path, data: data));

  Future<Map<String, dynamic>> getMap(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    final data = await get(path, query: query);
    return _asMap(data);
  }

  Future<List<dynamic>> getList(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    final data = await get(path, query: query);
    return _asList(data);
  }

  Future<Map<String, dynamic>> postMap(String path, {Object? data}) async =>
      _asMap(await post(path, data: data));

  Future<Map<String, dynamic>> patchMap(String path, {Object? data}) async =>
      _asMap(await patch(path, data: data));

  Future<dynamic> _send(Future<Response<dynamic>> Function() request) async {
    try {
      final response = await request();
      return response.data;
    } on DioException catch (error) {
      throw NitumeApiException.fromDio(error);
    }
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.cast<String, dynamic>();
    throw const NitumeApiException(message: 'Unexpected response from Nitume.');
  }

  List<dynamic> _asList(dynamic data) {
    if (data is List) return data;
    throw const NitumeApiException(message: 'Unexpected response from Nitume.');
  }

  void close() {
    _dio.close(force: true);
    _rawDio.close(force: true);
  }
}
