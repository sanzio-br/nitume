import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import 'live_updates.dart';
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
    required this.errands,
    required this.payments,
    required this.evidence,
    required this.ratings,
    required this.priceChanges,
    required this.disputes,
    required this.notifications,
    required this.account,
    required this.runners,
    required this.auth,
    this.appConfig = const AppConfig(),
    LiveUpdates? live,
    this.placeSearch,
    this.push = const NoopPushService(),
    ShellController? shell,
    IdempotencyKeyStore? idempotencyKeys,
    this.pollingEnabled = true,
  }) : live = live ?? LiveUpdates(null),
       shell = shell ?? ShellController(),
       idempotencyKeys = idempotencyKeys ?? InMemoryIdempotencyKeyStore() {
    paymentAttempts = PaymentAttemptKeys(this.idempotencyKeys);
  }

  /// Production wiring against [baseUrl]: socket, Places, Maps flag, FCM
  /// and link opening from the build configuration (`_shared.md` §10).
  static Future<AppServices> create({required String baseUrl}) async {
    late final SessionController session;
    final tokenStore = SecureTokenStore();
    final api = NitumeApiClient(
      config: ApiConfig(baseUrl: baseUrl),
      tokenStore: tokenStore,
      // The client ends the session (expiry, suspension) after this hook:
      // unregister the push device while the tokens still work. Log out
      // (the only other token clear) unregisters itself first.
      beforeSessionCleared: () => session.beforeTokensCleared(),
      onUnauthenticated: () => session.expire(),
      onAccountSuspended: () => session.suspend(),
    );
    final auth = AuthRepository(api: api, tokenStore: tokenStore);
    // FCM (row 31): a no-op service when Firebase is not configured.
    final push = await FcmPushService.initialize();
    session = SessionController(
      auth: auth,
      push: FcmPushRegistrar(
        PushRegistration(push: push, devices: DevicesRepository(api)),
      ),
    );
    Future<String?> accessToken() async =>
        (await tokenStore.read())?.accessToken;
    final config = AppConfig.fromEnvironment(onOpenLink: openExternalLink);
    return AppServices(
      session: session,
      auth: auth,
      idempotencyKeys: SecureIdempotencyKeyStore(),
      errands: ErrandRepository(api),
      payments: PaymentsRepository(api),
      evidence: EvidenceRepository(api),
      ratings: RatingsRepository(api),
      priceChanges: PriceChangeRepository(api),
      disputes: DisputesRepository(api),
      notifications: NotificationsRepository(api),
      account: CustomerAccountRepository(api),
      runners: RunnersRepository(api),
      appConfig: config,
      live: LiveUpdates(
        SocketIoRealtimeClient(
          url: SocketIoRealtimeClient.originFor(baseUrl),
          tokenProvider: accessToken,
        ),
        accessToken: accessToken,
      ),
      placeSearch: GooglePlaceSearchService.maybe(config.placesApiKey),
      push: push,
    );
  }

  final SessionController session;
  final AuthRepository auth;
  final ErrandRepository errands;
  final PaymentsRepository payments;
  final EvidenceRepository evidence;
  final RatingsRepository ratings;
  final PriceChangeRepository priceChanges;
  final DisputesRepository disputes;
  final NotificationsRepository notifications;
  final CustomerAccountRepository account;
  final RunnersRepository runners;
  final AppConfig appConfig;
  final ShellController shell;

  /// Persisted per-attempt idempotency keys (row 24; survive a restart),
  /// cleared on sign-out.
  final IdempotencyKeyStore idempotencyKeys;
  late final PaymentAttemptKeys paymentAttempts;

  /// Live updates over the app-wide socket (rows 23, 29).
  final LiveUpdates live;

  /// FCM; taps deep-link through `Nav.openNotification`.
  final PushService push;

  /// Google Places; `null` without a Places key (row 30): screens fall back
  /// to saved addresses with coordinates.
  final PlaceSearchService? placeSearch;

  /// Tests switch periodic polling off so `pumpAndSettle` can finish.
  final bool pollingEnabled;

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
