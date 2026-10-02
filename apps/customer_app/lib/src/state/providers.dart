import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

/// Signals that the session is gone (refresh failed / revoked). The router
/// listens to this to bounce the user back to the OTP screen.
final sessionExpiredProvider = StateProvider<bool>((ref) => false);

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<NitumeApiClient>((ref) {
  final client = NitumeApiClient(
    config: ApiConfig(baseUrl: resolveApiBaseUrl()),
    tokenStore: ref.watch(tokenStoreProvider),
    onUnauthenticated: () =>
        ref.read(sessionExpiredProvider.notifier).state = true,
  );
  ref.onDispose(client.close);
  return client;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    api: ref.watch(apiClientProvider),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});

String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;
  final isAndroid = defaultTargetPlatform == TargetPlatform.android;
  return isAndroid ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';
}