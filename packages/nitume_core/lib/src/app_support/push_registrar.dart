import '../push/push_service.dart';

/// Registers this install's push token for the session (row 31).
abstract interface class PushTokenRegistrar {
  Future<void> registerAfterSignIn();
  Future<void> unregisterBeforeSignOut();
}

/// Push off (tests; builds without Firebase).
class NoPushTokenRegistrar implements PushTokenRegistrar {
  const NoPushTokenRegistrar();

  @override
  Future<void> registerAfterSignIn() async {}

  @override
  Future<void> unregisterBeforeSignOut() async {}
}

/// FCM token registration through core [PushRegistration]: registers after
/// every sign-in (and on start with a restored session), re-registers on
/// token refresh, unregisters on log out and on a suspended session. The
/// OS permission is asked once per app run.
class FcmPushRegistrar implements PushTokenRegistrar {
  FcmPushRegistrar(this.registration);

  final PushRegistration registration;
  bool _asked = false;

  @override
  Future<void> registerAfterSignIn() async {
    final ask = !_asked;
    _asked = true;
    await registration.register(askPermission: ask);
  }

  @override
  Future<void> unregisterBeforeSignOut() => registration.unregister();
}
