import '../api/nitume_api_client.dart';
import '../models/app_user.dart';
import '../models/auth_tokens.dart';
import '../models/enums.dart';
import '../storage/token_store.dart';

/// A successful OTP verification: the signed-in user plus their JWT pair.
class AuthResult {
  const AuthResult({required this.user, required this.tokens});

  final AppUser user;
  final AuthTokens tokens;
}

/// Phone/email OTP authentication against `apps/api/src/auth`.
class AuthRepository {
  AuthRepository({required this._api, required TokenStore tokenStore})
    : _tokenStore = tokenStore;

  final NitumeApiClient _api;
  final TokenStore _tokenStore;

  /// Sends a 6-digit OTP to [phone]. Returns the API's confirmation message.
  Future<String> requestOtp(String phone) async {
    final data = await _api.postMap(
      '/auth/otp/request',
      data: {'phone': phone},
    );
    return (data['message'] as String?) ?? 'Verification code sent.';
  }

  /// Verifies [code] and persists the resulting session.
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
    UserRole? role,
  }) async {
    final data = await _api.postMap(
      '/auth/otp/verify',
      data: {'phone': phone, 'code': code, if (role != null) 'role': role.wire},
    );
    final result = AuthResult(
      user: AppUser.fromJson(_asMap(data['user'])),
      tokens: AuthTokens.fromJson(_asMap(data['tokens'])),
    );
    await _tokenStore.write(result.tokens);
    return result;
  }

  /// The authenticated user (`GET /users/me`).
  Future<AppUser> currentUser() async {
    final data = await _api.getMap('/users/me');
    return AppUser.fromJson(data);
  }

  /// Reads a previously persisted session, if any.
  Future<AuthTokens?> restoreSession() => _tokenStore.read();

  /// Revokes the refresh token server-side and clears local credentials.
  Future<void> logout() async {
    final tokens = await _tokenStore.read();
    try {
      if (tokens != null) {
        await _api.post(
          '/auth/logout',
          data: {'refreshToken': tokens.refreshToken},
        );
      }
    } finally {
      await _tokenStore.clear();
    }
  }

  Map<String, dynamic> _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return value.cast<String, dynamic>();
    throw StateError(
      'Expected a JSON object but received ${value.runtimeType}',
    );
  }
}
