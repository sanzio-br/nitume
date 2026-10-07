import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

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
    this.realtime,
    this.placeSearch,
    ShellController? shell,
    PaymentAttempts? paymentAttempts,
    this.pollingEnabled = true,
  })  : shell = shell ?? ShellController(),
        paymentAttempts = paymentAttempts ?? PaymentAttempts();

  /// Production wiring against [baseUrl].
  factory AppServices.create({required String baseUrl}) {
    final tokenStore = SecureTokenStore();
    late final SessionController session;
    final api = NitumeApiClient(
      config: ApiConfig(baseUrl: baseUrl),
      tokenStore: tokenStore,
      onUnauthenticated: () => session.expire(),
    );
    final auth = AuthRepository(api: api, tokenStore: tokenStore);
    session = SessionController(auth: auth);
    return AppServices(
      session: session,
      auth: auth,
      errands: ErrandRepository(api),
      payments: PaymentsRepository(api),
      evidence: EvidenceRepository(api),
      ratings: RatingsRepository(api),
      priceChanges: PriceChangeRepository(api),
      disputes: DisputesRepository(api),
      notifications: NotificationsRepository(api),
      account: CustomerAccountRepository(api),
      runners: RunnersRepository(api),
      // url_launcher is not approved (SQ-2, row 39): no opener, so every
      // AppConfig link getter is null and the rows are hidden.
      appConfig: AppConfig.fromEnvironment(),
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
  final PaymentAttempts paymentAttempts;

  /// Live updates. `null` until a Socket.IO client is approved (row 29);
  /// screens poll instead.
  final RealtimeClient? realtime;

  /// Google Places. `null` until a Places client is approved (row 30).
  final PlaceSearchService? placeSearch;

  /// Tests switch periodic polling off so `pumpAndSettle` can finish.
  final bool pollingEnabled;
}

/// One idempotency key per checkout attempt, per errand (v-payment "Safe
/// retry"): reused for every retry of the attempt, replaced only when a new
/// attempt starts (`Try again` after FAILED, `Send a new prompt`, or
/// `idempotency_key_reused`).
///
/// Kept in memory for the app session. TODO(api-contract/core-ui): persist
/// across restarts once a general key-value store exists in core.
class PaymentAttempts {
  final Map<String, String> _keys = {};

  /// The current attempt's key for [errandId], creating one if needed.
  String keyFor(String errandId) =>
      _keys.putIfAbsent(errandId, PaymentsRepository.newIdempotencyKey);

  /// Starts a new attempt: the next [keyFor] returns a fresh key.
  void newAttempt(String errandId) => _keys.remove(errandId);
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
