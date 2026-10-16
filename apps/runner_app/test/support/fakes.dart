import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/app.dart';
import 'package:runner_app/src/navigation/routes.dart';
import 'package:runner_app/src/services/app_services.dart';
import 'package:runner_app/src/services/session.dart';

/// A client that is never called: every fake overrides the methods screens
/// use.
final _api = NitumeApiClient(
  config: const ApiConfig(baseUrl: 'http://localhost:0/api/v1'),
  tokenStore: InMemoryTokenStore(),
);

AppUser user({
  String? displayName = 'Brian Kamau',
  UserRole role = UserRole.runner,
}) => AppUser(
  id: 'u1',
  phone: '+254733111222',
  role: role,
  status: UserStatus.active,
  displayName: displayName,
  createdAt: DateTime(2026, 2, 1),
);

class FakeAuth extends AuthRepository {
  FakeAuth() : super(api: _api, tokenStore: InMemoryTokenStore());

  AppUser current = user();
  AuthTokens? stored;
  final requested = <String>[];
  Object? requestError;
  Object? verifyError;
  final verified = <String>[];
  final roles = <UserRole?>[];
  Object? nameError;
  Object? currentError;
  int logouts = 0;

  @override
  Future<String> requestOtp(String phone) async {
    requested.add(phone);
    final e = requestError;
    if (e != null) throw e;
    return 'Verification code sent.';
  }

  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
    UserRole? role,
  }) async {
    verified.add(code);
    roles.add(role);
    final e = verifyError;
    if (e != null) throw e;
    stored = const AuthTokens(accessToken: 'a', refreshToken: 'r');
    return AuthResult(user: current, tokens: stored!);
  }

  @override
  Future<AppUser> currentUser() async {
    final e = currentError;
    if (e != null) throw e;
    return current;
  }

  @override
  Future<AppUser> updateDisplayName(String displayName) async {
    final e = nameError;
    if (e != null) throw e;
    current = user(displayName: displayName.trim());
    return current;
  }

  @override
  Future<AuthTokens?> restoreSession() async => stored;

  @override
  Future<void> logout() async {
    logouts++;
    stored = null;
  }
}

/// Records push registration calls.
class FakePushRegistrar implements PushTokenRegistrar {
  int registered = 0;
  int unregistered = 0;

  @override
  Future<void> registerAfterSignIn() async => registered++;

  @override
  Future<void> unregisterBeforeSignOut() async => unregistered++;
}

Future<void> setUpSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(400, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
}

/// All fakes plus the [AppServices] built from them.
class TestBackend {
  TestBackend({AppConfig appConfig = const AppConfig()}) {
    services = AppServices(
      session: SessionController(auth: auth, push: push),
      auth: auth,
      appConfig: appConfig,
    );
  }

  final auth = FakeAuth();
  final push = FakePushRegistrar();
  late final AppServices services;

  /// Starts the app. With [signedIn] the session restores straight into the
  /// shell.
  Future<void> pumpApp(WidgetTester tester, {bool signedIn = true}) async {
    if (signedIn) {
      auth.stored = const AuthTokens(accessToken: 'a', refreshToken: 'r');
    }
    await setUpSurface(tester);
    await tester.pumpWidget(NitumeRunnerApp(services: services));
    await tester.pumpAndSettle();
  }

  /// Pumps [screen] as the only route, inside the app's scope and theme.
  Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
    await setUpSurface(tester);
    await tester.pumpWidget(
      AppScope(
        services: services,
        child: MaterialApp(
          theme: NitumeTheme.light(),
          home: screen,
          onGenerateRoute: onGenerateRoute,
          navigatorObservers: [services.routeObserver],
        ),
      ),
    );
    await tester.pumpAndSettle();
  }
}
