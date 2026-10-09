import 'package:nitume_core/nitume_core.dart';

import 'session.dart';

/// FCM token registration for the session (row 31): registers after every
/// sign-in, after name capture and on app start with a restored session;
/// re-registers on token refresh (core `PushRegistration`); unregisters on
/// log out and on a suspended session.
class FcmPushRegistrar implements PushTokenRegistrar {
  FcmPushRegistrar(this.registration);

  final PushRegistration registration;
  bool _asked = false;

  @override
  Future<void> registerAfterSignIn() async {
    // Permission is asked once per app run after sign-in; refusing it
    // changes nothing else.
    final ask = !_asked;
    _asked = true;
    await registration.register(askPermission: ask);
  }

  @override
  Future<void> unregisterBeforeSignOut() => registration.unregister();
}
