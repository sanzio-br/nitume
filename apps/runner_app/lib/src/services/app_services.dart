import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';

import 'capture_files.dart';
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
    required this.account,
    required this.jobs,
    required this.notifications,
    required this.capture,
    required this.location,
    required this.permissions,
    required this.files,
    this.appConfig = const AppConfig(),
    this.push = const NoopPushService(),
    DateTime Function()? clock,
    ShellController? shell,
  }) : shell = shell ?? ShellController(),
       clock = clock ?? DateTime.now;

  /// Production wiring against [baseUrl] (`_shared.md` §10). The socket
  /// and the location pinger join here once their producers exist (RA-4,
  /// RA-5).
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
    final capture = ImagePickerCaptureSource();
    // Captures orphaned when Android killed the app mid-pick (B-1).
    unawaited(capture.discardLostCaptures().catchError((Object _) => 0));
    return AppServices(
      session: session,
      auth: auth,
      account: RunnerAccountRepository(api),
      jobs: RunnerJobsRepository(api),
      notifications: NotificationsRepository(api),
      capture: capture,
      location: const GeolocatorPositionSource(),
      permissions: const PermissionHandlerDevicePermissions(),
      files: const IoCaptureFiles(),
      appConfig: AppConfig.fromEnvironment(onOpenLink: openExternalLink),
      push: push,
    );
  }

  final SessionController session;
  final AuthRepository auth;

  /// R-19: `GET /runners/me`, availability, verifications and uploads.
  final RunnerAccountRepository account;

  /// R-19: offers, the runner job view, accept and decline.
  final RunnerJobsRepository jobs;

  /// Bell unread count.
  final NotificationsRepository notifications;

  /// Camera / gallery capture (`image_picker`, row 124).
  final ImageCaptureSource capture;

  /// Device location (`geolocator`, row 124). Read only while online
  /// (row 123: nothing is collected offline).
  final PositionSource location;

  /// Camera permission and the system-settings shortcut.
  final DevicePermissions permissions;

  /// Reads captured images into memory.
  final CaptureFiles files;

  /// Wall clock for offer countdowns; tests pin it.
  final DateTime Function() clock;
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
