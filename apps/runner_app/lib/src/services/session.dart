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

/// The phone belongs to a customer (or admin) account (RQ-15). The session
/// is already dropped when this is thrown.
class WrongAccountTypeException implements Exception {
  const WrongAccountTypeException();
}

/// API refusal for a non-runner phone on `POST /auth/otp/verify` with
/// `role: runner` (RA-9). Not sent by the API yet; the client role check in
/// [SessionController.completeSignIn] covers it until then.
// TODO(api-contract): RA-9; move to core `ApiErrorCodes` once the API sends it.
const roleMismatchCode = 'role_mismatch';

/// Registers this install's push token after sign-in (row 31).
abstract interface class PushTokenRegistrar {
  Future<void> registerAfterSignIn();
  Future<void> unregisterBeforeSignOut();
}

/// Push off (tests, builds without Firebase handled by core no-op service).
class NoPushTokenRegistrar implements PushTokenRegistrar {
  const NoPushTokenRegistrar();

  @override
  Future<void> registerAfterSignIn() async {}

  @override
  Future<void> unregisterBeforeSignOut() async {}
}

/// Session state for the runner app: restore on launch, OTP sign-in as a
/// runner, name capture, log out and session expiry.
///
/// Only `runner` accounts may hold a session here (RQ-15 default): any other
/// role is signed out at once (refresh token revoked, tokens cleared).
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
  bool _suspended = false;
  bool _wrongAccount = false;
  bool _loggingOut = false;

  SessionStatus get status => _status;

  /// The signed-in runner, when known.
  AppUser? get user => _user;

  /// True once after the session expired (`Please sign in again.`).
  bool takeExpiredFlag() {
    final e = _expired;
    _expired = false;
    return e;
  }

  /// True once after a mid-session `account_suspended`.
  bool takeSuspendedFlag() {
    final s = _suspended;
    _suspended = false;
    return s;
  }

  /// True once after a restored session turned out not to be a runner's.
  bool takeWrongAccountFlag() {
    final w = _wrongAccount;
    _wrongAccount = false;
    return w;
  }

  /// Restores a persisted session.
  Future<void> restore() async {
    _set(SessionStatus.restoring);
    final tokens = await _auth.restoreSession();
    if (tokens == null) {
      _set(SessionStatus.signedOut);
      return;
    }
    try {
      final user = await _auth.currentUser();
      if (!_isRunner(user)) {
        await _dropSession();
        _wrongAccount = true;
        _set(SessionStatus.signedOut);
        return;
      }
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

  /// Called by `v-auth-otp` after a successful verify. Refuses a non-runner
  /// account with [WrongAccountTypeException] after dropping its tokens;
  /// otherwise loads `GET /users/me` for the display name.
  Future<void> completeSignIn(AuthResult result) async {
    if (!_isRunner(result.user)) {
      await _dropSession();
      throw const WrongAccountTypeException();
    }
    AppUser user = result.user;
    try {
      final me = await _auth.currentUser();
      if (_isRunner(me)) user = me;
    } on NitumeApiException {
      // Keep the verify response's user.
    }
    _signIn(user);
  }

  /// Saves the display name (`x-name-capture`) and continues.
  Future<void> saveDisplayName(String name) async {
    final user = await _auth.updateDisplayName(name);
    _signIn(user);
  }

  /// Log out: unregister push, revoke, clear tokens.
  Future<void> logout() async {
    _loggingOut = true;
    try {
      await _push.unregisterBeforeSignOut();
    } on Object {
      // Never block log out.
    }
    await _dropSession();
    _loggingOut = false;
    _set(SessionStatus.signedOut);
  }

  /// The API refused the running session with `account_suspended`.
  void suspend() {
    if (_status == SessionStatus.signedOut) return;
    _user = null;
    _suspended = true;
    _set(SessionStatus.signedOut);
  }

  /// Runs before the API client clears the tokens (suspension, expiry).
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

  static bool _isRunner(AppUser user) => user.role == UserRole.runner;

  Future<void> _dropSession() async {
    _user = null;
    try {
      await _auth.logout();
    } on Object {
      // `AuthRepository.logout` clears local tokens even when revoke fails.
    }
  }

  void _signIn(AppUser user) {
    _user = user;
    final name = user.displayName?.trim() ?? '';
    // TODO(flutter-runner): route to onboarding (v-onboard-id / pending)
    // from GET /runners/me + verifications once core R-19 and the
    // onboarding screens land (v-auth-otp routing step 3).
    _set(name.isEmpty ? SessionStatus.needsName : SessionStatus.signedIn);
    if (name.isNotEmpty) {
      _push.registerAfterSignIn().catchError((Object _) {});
    }
  }

  void _set(SessionStatus status) {
    _status = status;
    notifyListeners();
  }
}
