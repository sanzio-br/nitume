import 'package:nitume_core/nitume_core.dart';

import 'session.dart';

/// FCM token registration for the session (row 31): registers after every
/// sign-in and on app start with a restored session; unregisters on log out
/// and on a suspended or expired session.
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
