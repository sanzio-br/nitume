import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

/// Drives the OTP sign-in flow and owns the persisted session.
class AuthController extends StateNotifier<AsyncValue<AppUser?>> {
  AuthController(this._repo) : super(const AsyncValue.data(null)) {
    restoreSession();
  }

  final AuthRepository _repo;

  /// Re-hydrates a persisted session on launch.
  Future<void> restoreSession() async {
    state = const AsyncValue.loading();
    try {
      final tokens = await _repo.restoreSession();
      if (tokens == null) {
        state = const AsyncValue.data(null);
        return;
      }
      final user = await _repo.currentUser();
      state = AsyncValue.data(user);
    } on NitumeApiException catch (error) {
      if (error.isUnauthorized) {
        state = const AsyncValue.data(null);
      } else {
        state = AsyncValue.error(error, StackTrace.current);
      }
    }
  }

  Future<void> verifyOtp({required String phone, required String code}) async {
    state = const AsyncValue.loading();
    try {
      final result = await _repo.verifyOtp(phone: phone, code: code);
      state = AsyncValue.data(result.user);
    } on NitumeApiException catch (error, stack) {
      state = AsyncValue.error(error, stack);
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AsyncValue.data(null);
  }
}