import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import 'push.dart';
import 'session.dart';
import 'shell_controller.dart';

/// Everything the screens need, built once per app session: one API client,
/// the core repositories, the session and the shell controller.
///
/// Tests build it with fakes through the default constructor.
class AppServices {
  AppServices({
    required this.session,
    required this.auth,
    this.appConfig = const AppConfig(),
    this.push = const NoopPushService(),
    ShellController? shell,
  }) : shell = shell ?? ShellController();

  /// Production wiring against [baseUrl] (`_shared.md` §10). The socket,
  /// location pinger and runner repositories join here once core-ui ships
  /// them (R-19 … R-22).
  static Future<AppServices> create({required String baseUrl}) async {
    late final SessionController session;
    final tokenStore = SecureTokenStore();
    final api = NitumeApiClient(
      config: ApiConfig(baseUrl: baseUrl),
      tokenStore: tokenStore,
      // Unregister the push device while the tokens still work.
      beforeSessionCleared: () => session.beforeTokensCleared(),
      onUnauthenticated: () => session.expire(),
      onAccountSuspended: () => session.suspend(),
    );
    final auth = AuthRepository(api: api, tokenStore: tokenStore);
    final push = await FcmPushService.initialize();
    session = SessionController(
      auth: auth,
      push: FcmPushRegistrar(
        PushRegistration(push: push, devices: DevicesRepository(api)),
      ),
    );
    return AppServices(
      session: session,
      auth: auth,
      appConfig: AppConfig.fromEnvironment(onOpenLink: openExternalLink),
      push: push,
    );
  }

  final SessionController session;
  final AuthRepository auth;
  final AppConfig appConfig;
  final ShellController shell;

  /// FCM; taps deep-link once the runner screens exist (`_shared.md` §10).
  final PushService push;

  /// Lets root tabs reload when a pushed screen above them closes.
  final RouteObserver<ModalRoute<void>> routeObserver =
      RouteObserver<ModalRoute<void>>();
}

/// Provides [AppServices] to the widget tree.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'No AppScope above this context');
    return scope!.services;
  }

  /// Non-listening lookup for callbacks.
  static AppServices read(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'No AppScope above this context');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      !identical(services, oldWidget.services);
}

/// Shorthand: `context.services`.
extension AppServicesContext on BuildContext {
  AppServices get services => AppScope.read(this);
}
