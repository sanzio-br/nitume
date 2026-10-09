import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

/// Where the signed-in flow stands (`_shared.md` §1, signed-out stack).
enum SessionStatus {
  /// Reading persisted tokens and `GET /users/me` on launch.
  restoring,

  /// Restore failed for a reason other than an invalid session (offline).
  restoreFailed,

  /// No session: `v-auth-phone`.
  signedOut,

  /// Signed in without a `displayName`: `x-name-capture` (OA-2).
  needsName,

  /// Signed in: the shell.
  signedIn,
}

/// Registers this install's push token after sign-in.
///
/// FCM (`firebase_messaging`) is pending owner approval (BOARD row 31), so the
/// app ships [NoPushTokenRegistrar]. Once approved, an implementation obtains
/// the token and calls `DevicesRepository.register`.
abstract interface class PushTokenRegistrar {
  Future<void> registerAfterSignIn();
  Future<void> unregisterBeforeSignOut();
}

/// No-op until FCM is approved (row 31).
class NoPushTokenRegistrar implements PushTokenRegistrar {
  const NoPushTokenRegistrar();

  @override
  Future<void> registerAfterSignIn() async {}

  @override
  Future<void> unregisterBeforeSignOut() async {}
}

/// Session state for the customer app: restore on launch, OTP sign-in, name
/// capture, log out and session expiry.
class SessionController extends ChangeNotifier {
  SessionController({
    required this._auth,
    this._push = const NoPushTokenRegistrar(),
  });

  final AuthRepository _auth;
  final PushTokenRegistrar _push;

  SessionStatus _status = SessionStatus.restoring;
  AppUser? _user;
  bool _expired = false;

  SessionStatus get status => _status;

  /// The signed-in user, when known.
  AppUser? get user => _user;

  /// True once after the session expired, so the app can show
  /// `Please sign in again.` (`_shared.md` §7). Read with [takeExpiredFlag].
  bool takeExpiredFlag() {
    final e = _expired;
    _expired = false;
    return e;
  }

  /// Restores a persisted session (v-auth-otp Data).
  Future<void> restore() async {
    _set(SessionStatus.restoring);
    final tokens = await _auth.restoreSession();
    if (tokens == null) {
      _set(SessionStatus.signedOut);
      return;
    }
    try {
      final user = await _auth.currentUser();
      _signIn(user);
    } on NitumeApiException catch (e) {
      if (e.isUnauthorized || e.statusCode == 401) {
        _user = null;
        _set(SessionStatus.signedOut);
      } else {
        _set(SessionStatus.restoreFailed);
      }
    }
  }

  /// Called by `v-auth-otp` after a successful verify. Loads `GET /users/me`
  /// for the display name, falling back to the verify response.
  Future<void> completeSignIn(AuthResult result) async {
    AppUser user = result.user;
    try {
      user = await _auth.currentUser();
    } on NitumeApiException {
      // Keep the verify response's user.
    }
    _signIn(user);
  }

  /// Saves the display name (`x-name-capture`) and enters the shell.
  Future<void> saveDisplayName(String name) async {
    final user = await _auth.updateDisplayName(name);
    _signIn(user);
  }

  /// Re-reads `GET /users/me` (Profile retry).
  Future<AppUser> refreshUser() async {
    final user = await _auth.currentUser();
    _user = user;
    notifyListeners();
    return user;
  }

  /// Log out (`v-profile`): unregister push, revoke, clear tokens.
  Future<void> logout() async {
    _loggingOut = true;
    try {
      await _push.unregisterBeforeSignOut();
    } on Object {
      // Never block log out.
    }
    try {
      await _auth.logout();
    } on Object {
      // `AuthRepository.logout` clears local tokens even when revoke fails.
    }
    _user = null;
    _loggingOut = false;
    _set(SessionStatus.signedOut);
  }

  bool _suspended = false;

  /// True once after a mid-session `account_suspended`, so the app can show
  /// `This account can't sign in. Contact support.` (`_shared.md` §7).
  bool takeSuspendedFlag() {
    final s = _suspended;
    _suspended = false;
    return s;
  }

  /// The API refused the running session with `account_suspended`: tokens
  /// are already cleared by the client; unregister push (best effort) and
  /// return to `v-auth-phone`.
  void suspend() {
    if (_status == SessionStatus.signedOut) return;
    // Push was unregistered in beforeTokensCleared, before the client
    // cleared the tokens.
    _user = null;
    _suspended = true;
    _set(SessionStatus.signedOut);
  }

  bool _loggingOut = false;

  /// Runs before the API client clears the tokens (suspension, expiry):
  /// unregister the push device while the tokens still work. Log out
  /// already does this itself.
  Future<void> beforeTokensCleared() async {
    if (_loggingOut || _status == SessionStatus.signedOut) return;
    await _push.unregisterBeforeSignOut();
  }

  /// The API rejected the session (refresh failed).
  void expire() {
    if (_status == SessionStatus.signedOut) return;
    _user = null;
    _expired = true;
    _set(SessionStatus.signedOut);
  }

  void _signIn(AppUser user) {
    _user = user;
    final name = user.displayName?.trim() ?? '';
    _set(name.isEmpty ? SessionStatus.needsName : SessionStatus.signedIn);
    if (name.isNotEmpty) {
      // Call site for FCM registration (row 31): a no-op until approved.
      _push.registerAfterSignIn().catchError((Object _) {});
    }
  }

  void _set(SessionStatus status) {
    _status = status;
    notifyListeners();
  }
}
