/// Configuration for [NitumeApiClient].
class ApiConfig {
  const ApiConfig({
    required this.baseUrl,
    this.connectTimeout = const Duration(seconds: 15),
    this.receiveTimeout = const Duration(seconds: 30),
    this.sendTimeout = const Duration(seconds: 30),
  });

  /// Root URL including the global prefix, e.g. `http://localhost:3000/api/v1`.
  final String baseUrl;

  final Duration connectTimeout;
  final Duration receiveTimeout;
  final Duration sendTimeout;

  /// Compile-time override: `--dart-define=NITUME_API_BASE_URL=...`.
  static const _envBaseUrl = String.fromEnvironment('NITUME_API_BASE_URL');

  /// Local development default. Android emulators reach the host via
  /// `10.0.2.2`, so callers should override [baseUrl] there.
  factory ApiConfig.dev({String baseUrl = 'http://localhost:3000/api/v1'}) {
    if (_envBaseUrl.isNotEmpty) return ApiConfig(baseUrl: _envBaseUrl);
    return ApiConfig(baseUrl: baseUrl);
  }

  factory ApiConfig.production({required String baseUrl}) =>
      ApiConfig(baseUrl: baseUrl);

  ApiConfig copyWith({String? baseUrl}) => ApiConfig(
        baseUrl: baseUrl ?? this.baseUrl,
        connectTimeout: connectTimeout,
        receiveTimeout: receiveTimeout,
        sendTimeout: sendTimeout,
      );
}
