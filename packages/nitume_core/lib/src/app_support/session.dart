import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';
import '../auth/auth_repository.dart';
import '../models/app_user.dart';
import '../models/enums.dart';
import 'push_registrar.dart';

/// Where the signed-in flow stands (signed-out stack, `_shared.md` §1).
enum SessionStatus {
  /// Reading persisted tokens and `GET /users/me` on launch.
  restoring,

  /// Restore failed for a reason other than an invalid session (offline).
  restoreFailed,

  /// No session: `v-auth-phone`.
  signedOut,

  /// Signed in without a `displayName`: `x-name-capture` (OA-2).
  needsName,

  /// Signed in.
  signedIn,
}

/// The phone belongs to an account of another role (runner app: a customer
/// or admin number, RQ-15 / row 127). The session is already dropped when
/// this is thrown.
class WrongAccountTypeException implements Exception {
  const WrongAccountTypeException();
}

/// Shared session state: restore on launch, OTP sign-in, name capture, log
/// out, suspension and expiry.
///
/// With [requiredRole] (the runner app passes [UserRole.runner]) only that
/// role may hold a session: any other account is signed out at once
/// (refresh token revoked, tokens cleared). Without it every role is
/// accepted (customer app behaviour).
class SessionController extends ChangeNotifier {
  SessionController({
    required this._auth,
    this._push = const NoPushTokenRegistrar(),
    this.requiredRole,
  });

  final AuthRepository _auth;
  final PushTokenRegistrar _push;

  /// Only this role may sign in; `null` accepts any role.
  final UserRole? requiredRole;

  SessionStatus _status = SessionStatus.restoring;
  AppUser? _user;
  bool _expired = false;
  bool _suspended = false;
  bool _wrongAccount = false;
  bool _loggingOut = false;

  SessionStatus get status => _status;

  /// The signed-in user, when known.
  AppUser? get user => _user;

  /// True once after the session expired (`Please sign in again.`).
  bool takeExpiredFlag() {
    final e = _expired;
    _expired = false;
    return e;
  }

  /// True once after a mid-session `account_suspended`
  /// (`This account can't sign in. Contact support.`).
  bool takeSuspendedFlag() {
    final s = _suspended;
    _suspended = false;
    return s;
  }

  /// True once after a restored session belonged to another role.
  bool takeWrongAccountFlag() {
    final w = _wrongAccount;
    _wrongAccount = false;
    return w;
  }

  bool _roleAllowed(AppUser user) =>
      requiredRole == null || user.role == requiredRole;

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
      if (!_roleAllowed(user)) {
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

  /// Called by `v-auth-otp` after a successful verify. Refuses an account
  /// of another role with [WrongAccountTypeException] after dropping its
  /// tokens; otherwise loads `GET /users/me` for the display name, falling
  /// back to the verify response.
  Future<void> completeSignIn(AuthResult result) async {
    if (!_roleAllowed(result.user)) {
      await _dropSession();
      throw const WrongAccountTypeException();
    }
    AppUser user = result.user;
    try {
      final me = await _auth.currentUser();
      if (_roleAllowed(me)) user = me;
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

  /// Re-reads `GET /users/me`.
  Future<AppUser> refreshUser() async {
    final user = await _auth.currentUser();
    _user = user;
    notifyListeners();
    return user;
  }

  /// Log out: unregister push (best effort), revoke, clear tokens.
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

  /// The API refused the running session with `account_suspended`; the
  /// client already cleared the tokens (push was unregistered in
  /// [beforeTokensCleared]).
  void suspend() {
    if (_status == SessionStatus.signedOut) return;
    _user = null;
    _suspended = true;
    _set(SessionStatus.signedOut);
  }

  /// Runs before the API client clears the tokens (suspension, expiry):
  /// unregister the push device while the tokens still work.
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
