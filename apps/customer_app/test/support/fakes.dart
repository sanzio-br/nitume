import 'dart:async';

import 'package:customer_app/src/services/live_updates.dart';
import 'package:customer_app/src/app.dart';
import 'package:customer_app/src/navigation/routes.dart';
import 'package:customer_app/src/services/app_services.dart';
import 'package:customer_app/src/services/session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// A client that is never called: every fake overrides the methods screens
/// use.
final _api = NitumeApiClient(
  config: const ApiConfig(baseUrl: 'http://localhost:0/api/v1'),
  tokenStore: InMemoryTokenStore(),
);

/// Fixture day, three calendar days before the real clock, so relative
/// formatting (`Mon, 10:03 AM`) renders the same whatever day the suite runs.
/// Fixture dates must never be fixed: a fixed date drifts past the one-week
/// window and switches to the absolute `7 Oct, 10:03 AM` form.
final DateTime fixtureDay = () {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day - 3);
}();

/// [hour]:[minute] on [fixtureDay], shifted by [days] calendar days.
DateTime fixtureAt(int hour, [int minute = 0, int days = 0]) => DateTime(
  fixtureDay.year,
  fixtureDay.month,
  fixtureDay.day + days,
  hour,
  minute,
);

final _epoch = fixtureAt(10, 3);

AppUser user({String? displayName = 'Achieng Otieno'}) => AppUser(
  id: 'u1',
  phone: '+254712345678',
  role: UserRole.customer,
  status: UserStatus.active,
  displayName: displayName,
  createdAt: DateTime(2026, 2, 1),
);

RunnerSummary runner({String? name = 'Brian Kamau'}) => RunnerSummary(
  id: 'r1',
  verificationLevel: VerificationLevel.idVerified,
  avgRating: '4.90',
  errandsCompleted: 137,
  displayName: name,
  // The API computes the short name (row 40).
  shortName: name == null ? null : 'Brian K.',
);

Errand errand({
  String id = 'e1',
  ErrandStatus status = ErrandStatus.inProgress,
  ErrandCategory category = ErrandCategory.checkItForMe,
  String? title = 'Apartment check — Nyali',
  String? reference = 'NT-10482',
  String budget = '0.00',
  String? quotedPrice,
  bool withRunner = true,
  String? runnerNotes,
  DateTime? updatedAt,
  bool? merchantDetailsAvailable,
  String? feeTotal,
  bool quoteAcceptanceRequired = false,
  DateTime? quoteRequestedAt,
}) => Errand(
  id: id,
  customerId: 'u1',
  category: category,
  description: 'Check the apartment',
  status: status,
  urgency: ErrandUrgency.standard,
  budget: budget,
  quotedPrice: quotedPrice,
  title: title,
  reference: reference,
  runnerNotes: runnerNotes,
  merchantDetailsAvailable: merchantDetailsAvailable,
  feeTotal: feeTotal,
  quoteAcceptanceRequired: quoteAcceptanceRequired,
  quoteRequestedAt: quoteRequestedAt,
  createdAt: _epoch,
  updatedAt: updatedAt ?? _epoch,
  locations: const [
    ErrandLocation(
      pointType: ErrandPointType.taskSite,
      lat: -4.03,
      lng: 39.71,
      addressText: 'Links Road Apartments, Nyali',
    ),
  ],
  assignment: withRunner
      ? ErrandAssignment(
          id: 'a1',
          status: AssignmentStatus.accepted,
          assignedAt: _epoch,
          runner: runner(),
        )
      : null,
);

class FakeAuth extends AuthRepository {
  FakeAuth() : super(api: _api, tokenStore: InMemoryTokenStore());

  AppUser current = user();
  AuthTokens? stored;
  final requested = <String>[];
  Object? requestError;
  Object? verifyError;
  final verified = <String>[];
  Object? nameError;
  bool loggedOut = false;

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
    final e = verifyError;
    if (e != null) throw e;
    stored = const AuthTokens(accessToken: 'a', refreshToken: 'r');
    return AuthResult(user: current, tokens: stored!);
  }

  @override
  Future<AppUser> currentUser() async => current;

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
    loggedOut = true;
    stored = null;
  }
}

class FakeErrands extends ErrandRepository {
  FakeErrands() : super(_api);

  final Map<String, Errand> byId = {};
  final transitions = <(String, ErrandStatus)>[];
  final created = <CreateErrandRequest>[];
  final titles = <(String, String?)>[];
  final submitted = <String>[];
  Object? listError;
  Object? submitError;
  Object? transitionError;
  Quote? quoteValue;
  TrackingSnapshot? trackingValue;
  List<StatusHistoryEntry> historyValue = const [];
  int countValue = 0;

  void put(Errand e) => byId[e.id] = e;

  @override
  Future<ErrandTransitionResult> create(CreateErrandRequest request) async {
    created.add(request);
    final e = Errand(
      id: 'new1',
      customerId: 'u1',
      category: request.category,
      description: request.description,
      status: ErrandStatus.draft,
      urgency: ErrandUrgency.standard,
      budget: '${request.budget}',
      locations: request.locations,
    );
    put(e);
    return _result(e);
  }

  @override
  Future<ErrandTransitionResult> submit(String errandId) async {
    submitted.add(errandId);
    final err = submitError;
    if (err != null) throw err;
    return _result(_withStatus(errandId, ErrandStatus.requested));
  }

  @override
  Future<ErrandTransitionResult> transition(
    String errandId,
    ErrandStatus to, {
    String? note,
  }) async {
    transitions.add((errandId, to));
    final err = transitionError;
    if (err != null) throw err;
    return _result(_withStatus(errandId, to));
  }

  @override
  Future<Errand> updateTitle(String errandId, String? title) async {
    titles.add((errandId, title));
    return byId[errandId]!;
  }

  @override
  Future<ErrandPage> list({
    Set<ErrandStatus>? statuses,
    int? limit,
    String? cursor,
  }) async {
    final err = listError;
    if (err != null) throw err;
    final items =
        byId.values
            .where((e) => e.status != ErrandStatus.draft)
            .where((e) => statuses == null || statuses.contains(e.status))
            .toList()
          ..sort((a, b) => b.updatedAt!.compareTo(a.updatedAt!));
    return ErrandPage(
      items: limit == null ? items : items.take(limit).toList(),
    );
  }

  @override
  Future<int> count({Set<ErrandStatus>? statuses}) async => countValue;

  @override
  Future<Errand> get(String errandId) async {
    final e = byId[errandId];
    if (e == null) {
      throw const NitumeApiException(message: 'Not found', statusCode: 404);
    }
    return e;
  }

  @override
  Future<List<StatusHistoryEntry>> history(String errandId) async =>
      historyValue;

  @override
  Future<Quote?> quote(String errandId) async => quoteValue;

  List<CustomerRefund> refundsValue = const [];
  Object? quoteRequestError;
  final quoteRequests = <String>[];

  /// Records the request like the API: `quoteRequestedAt` = now.
  @override
  Future<Errand> requestNewQuote(String errandId) async {
    quoteRequests.add(errandId);
    final err = quoteRequestError;
    if (err != null) throw err;
    final e = byId[errandId]!;
    final next = Errand(
      id: e.id,
      customerId: e.customerId,
      category: e.category,
      description: e.description,
      status: e.status,
      urgency: e.urgency,
      budget: e.budget,
      quotedPrice: e.quotedPrice,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      reference: e.reference,
      title: e.title,
      locations: e.locations,
      feeTotal: e.feeTotal,
      quoteRequestedAt: DateTime.now(),
    );
    put(next);
    return next;
  }

  final quoteAccepts = <String>[];

  @override
  Future<CustomerRefund?> refund(String errandId) async =>
      refundsValue.isEmpty ? null : refundsValue.first;

  @override
  Future<List<CustomerRefund>> refunds(String errandId) async => refundsValue;

  /// Like the API: QUOTED moves to ACCEPTED; ACCEPTED stays.
  @override
  Future<QuoteAcceptanceResult> acceptQuote(
    String errandId, {
    bool fallbackToTransition = false,
  }) async {
    quoteAccepts.add(errandId);
    final e = transitionError;
    if (e != null) throw e;
    final current = byId[errandId]!;
    if (current.status == ErrandStatus.quoted) {
      return QuoteAcceptanceResult(
        errand: _withStatus(errandId, ErrandStatus.accepted),
      );
    }
    return QuoteAcceptanceResult(errand: current);
  }

  Object? trackingError;

  @override
  Future<TrackingSnapshot> tracking(String errandId) async {
    final err = trackingError;
    if (err != null) throw err;
    return trackingValue ??
        TrackingSnapshot(
          errandId: errandId,
          status: byId[errandId]?.status ?? ErrandStatus.inProgress,
          live: false,
          points: byId[errandId]?.locations ?? const [],
        );
  }

  Errand _withStatus(String id, ErrandStatus status) {
    final e = byId[id]!;
    final next = Errand(
      id: e.id,
      customerId: e.customerId,
      category: e.category,
      description: e.description,
      status: status,
      urgency: e.urgency,
      budget: e.budget,
      quotedPrice: e.quotedPrice,
      finalPrice: e.finalPrice,
      deadlineAt: e.deadlineAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      assignment: e.assignment,
      reference: e.reference,
      title: e.title,
      runnerNotes: e.runnerNotes,
      items: e.items,
      locations: e.locations,
      merchantDetailsAvailable: e.merchantDetailsAvailable,
      feeTotal: e.feeTotal,
      quoteAcceptanceRequired: e.quoteAcceptanceRequired,
      quoteExpiresAt: e.quoteExpiresAt,
      quoteRequestedAt: e.quoteRequestedAt,
    );
    put(next);
    return next;
  }

  ErrandTransitionResult _result(Errand e) => ErrandTransitionResult(
    errand: e,
    history: StatusHistoryEntry(
      id: 'h${transitions.length}',
      errandId: e.id,
      toStatus: e.status,
      actorType: StatusHistoryActor.customer,
    ),
  );
}

Payment payment({
  String errandId = 'e1',
  PaymentStatus status = PaymentStatus.completed,
  String merchantAmount = '0.00',
  PaymentFlow flow = PaymentFlow.platformOnly,
}) => Payment(
  id: 'p1',
  errandId: errandId,
  serviceFee: '700.00',
  runnerFee: '1500.00',
  merchantAmount: merchantAmount,
  paymentFlow: flow,
  status: status,
);

class FakePayments extends PaymentsRepository {
  FakePayments() : super(_api);

  PaymentSummary summary = const PaymentSummary();
  final initiations = <(String, String, MerchantRoute?, String?)>[];
  Object? initiateError;

  /// Status the next initiation reports.
  StkPaymentState initiateState = StkPaymentState.pending;

  @override
  Future<PaymentInitiation> initiateWith(
    String errandId, {
    required String idempotencyKey,
    MerchantRoute? merchantRoute,
    String? paymentMethodId,
  }) async {
    initiations.add((errandId, idempotencyKey, merchantRoute, paymentMethodId));
    final e = initiateError;
    if (e != null) throw e;
    final p = payment(errandId: errandId, status: PaymentStatus.pending);
    summary = PaymentSummary(payment: p, stkStatus: initiateState);
    return PaymentInitiation(
      payment: p,
      reference: 'NT-10482',
      checkoutRequestId: 'ws_1',
      transactions: const [],
      stkStatus: initiateState,
    );
  }

  final retried = <String>[];

  @override
  Future<ItemPayment> retryDifferencePayment(
    String errandId,
    String requestId,
  ) async {
    retried.add(requestId);
    final d = ItemPayment(
      payment: payment(
        errandId: errandId,
        status: PaymentStatus.pending,
        merchantAmount: '5000.00',
        flow: PaymentFlow.customerToRunner,
      ),
      stkStatus: StkPaymentState.pending,
    );
    summary = PaymentSummary(
      payment: summary.payment,
      merchantPayment: summary.merchantPayment,
      differencePayments: [d],
    );
    return d;
  }

  @override
  Future<PaymentSummary> forErrand(String errandId) async => summary;
}

class FakeEvidence extends EvidenceRepository {
  FakeEvidence() : super(_api);

  List<Evidence> items = const [];
  int calls = 0;

  @override
  Future<List<Evidence>> list(String errandId) async {
    calls++;
    return items;
  }
}

class FakeRatings extends RatingsRepository {
  FakeRatings() : super(_api);

  Rating? existing;
  final rated = <(String, int, String?)>[];
  Object? rateError;

  @override
  Future<Rating> rate(
    String errandId, {
    required int score,
    String? comment,
  }) async {
    rated.add((errandId, score, comment));
    final e = rateError;
    if (e != null) throw e;
    return Rating(
      id: 'rt1',
      errandId: errandId,
      raterUserId: 'u1',
      rateeUserId: 'ru1',
      score: score,
      comment: comment,
    );
  }

  @override
  Future<Rating?> get(String errandId) async => existing;
}

PriceChangeRequest priceChange({
  String errandId = 'e1',
  PriceChangeStatus status = PriceChangeStatus.requested,
  String toPrice = '45000.00',
}) => PriceChangeRequest(
  id: 'pc1',
  errandId: errandId,
  requestedByUserId: 'ru1',
  fromPrice: '40000.00',
  toPrice: toPrice,
  status: status,
  reason: 'The shop raised the price.',
);

class FakePriceChanges extends PriceChangeRepository {
  FakePriceChanges() : super(_api);

  PriceChangeRequest? pendingValue;
  final approved = <String>[];
  final approvedRoutes = <MerchantRoute?>[];

  /// Answer MERCHANT_ROUTE_REQUIRED while no route is sent.
  bool requireRoute = false;
  String routeCode = ApiErrorCodes.merchantRouteRequired;
  Object? pendingError;
  final rejected = <String>[];
  Object? decisionError;
  PriceChangeDifference? difference;

  @override
  Future<PriceChangeRequest?> pending(String errandId) async {
    final e = pendingError;
    if (e != null) throw e;
    return pendingValue;
  }

  @override
  Future<PriceChangeDecision> approve(
    String errandId,
    String requestId, {
    MerchantRoute? merchantRoute,
  }) async {
    if (requireRoute && merchantRoute == null) {
      throw NitumeApiException(
        message: 'route',
        statusCode: 400,
        code: routeCode,
      );
    }
    approved.add(requestId);
    approvedRoutes.add(merchantRoute);
    final e = decisionError;
    if (e != null) throw e;
    pendingValue = null;
    return PriceChangeDecision(
      request: priceChange(status: PriceChangeStatus.approved),
      differencePayment: difference,
    );
  }

  @override
  Future<PriceChangeDecision> reject(String errandId, String requestId) async {
    rejected.add(requestId);
    final e = decisionError;
    if (e != null) throw e;
    pendingValue = null;
    return PriceChangeDecision(
      request: priceChange(status: PriceChangeStatus.rejected),
    );
  }
}

class FakeDisputes extends DisputesRepository {
  FakeDisputes() : super(_api);

  Dispute? existing;
  final opened = <(String, String)>[];
  Object? openError;

  @override
  Future<Dispute> open({
    required String errandId,
    required String reason,
  }) async {
    opened.add((errandId, reason));
    final e = openError;
    if (e != null) throw e;
    existing = Dispute(
      id: 'd1',
      errandId: errandId,
      openedBy: 'u1',
      reason: reason,
      status: DisputeStatus.open,
      createdAt: _epoch,
    );
    return existing!;
  }

  @override
  Future<Dispute?> forErrand(String errandId) async => existing;
}

class FakeNotifications extends NotificationsRepository {
  FakeNotifications() : super(_api);

  List<AppNotification> items = const [];
  final read = <String>[];
  bool allRead = false;

  @override
  Future<NotificationsPage> list({int? limit}) async => NotificationsPage(
    items: items,
    unread: items.where((n) => !n.isRead).length,
  );

  @override
  Future<int> unreadCount() async => items.where((n) => !n.isRead).length;

  @override
  Future<AppNotification> markRead(String id) async {
    read.add(id);
    return items.firstWhere((n) => n.id == id);
  }

  @override
  Future<int> markAllRead() async {
    allRead = true;
    return items.length;
  }
}

class FakeAccount extends CustomerAccountRepository {
  FakeAccount() : super(_api);

  List<SavedAddress> addressList = const [];
  List<PaymentMethod> methods = const [];
  final added = <Map<String, Object?>>[];
  final removed = <String>[];
  Object? addMethodError;

  @override
  Future<List<SavedAddress>> addresses() async => addressList;

  @override
  Future<SavedAddress> addAddress({
    required String label,
    required String addressText,
    double? lat,
    double? lon,
    bool? isDefault,
  }) async {
    added.add({
      'label': label,
      'addressText': addressText,
      'lat': lat,
      'lon': lon,
      'isDefault': isDefault,
    });
    final a = SavedAddress(
      id: 'ad${added.length}',
      label: label,
      addressText: addressText,
      isDefault: isDefault ?? false,
    );
    addressList = [...addressList, a];
    return a;
  }

  @override
  Future<SavedAddress> updateAddress(
    String id, {
    String? label,
    String? addressText,
    double? lat,
    double? lon,
  }) async {
    added.add({
      'id': id,
      'label': label,
      'addressText': addressText,
      'lat': lat,
      'lon': lon,
    });
    return addressList.firstWhere((a) => a.id == id);
  }

  @override
  Future<SavedAddress> setDefaultAddress(String id) async =>
      addressList.firstWhere((a) => a.id == id);

  @override
  Future<void> removeAddress(String id) async => removed.add(id);

  @override
  Future<List<PaymentMethod>> paymentMethods() async => methods;

  @override
  Future<PaymentMethod> addPaymentMethod({
    required String label,
    required String detail,
    String? phoneNumber,
    bool? isDefault,
  }) async {
    final e = addMethodError;
    if (e != null) throw e;
    added.add({
      'label': label,
      'detail': detail,
      'phoneNumber': phoneNumber,
      'isDefault': isDefault,
    });
    final m = PaymentMethod(
      id: 'pm${added.length}',
      type: PaymentMethodType.mpesa,
      label: label,
      detail: detail,
      isDefault: isDefault ?? false,
    );
    methods = [...methods, m];
    return m;
  }

  @override
  Future<PaymentMethod> updatePaymentMethod(
    String id, {
    String? label,
    String? detail,
    bool? isDefault,
  }) async {
    added.add({'id': id, 'label': label, 'isDefault': isDefault});
    return methods.firstWhere((m) => m.id == id);
  }

  @override
  Future<void> removePaymentMethod(String id) async => removed.add(id);
}

class FakeRunners extends RunnersRepository {
  FakeRunners() : super(_api);
}

Future<void> _setUp(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(400, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  // Stops PulsingDots so pumpAndSettle can settle.
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
}

/// All fakes plus the [AppServices] built from them.
class TestBackend {
  TestBackend({
    PlaceSearchService? placeSearch,
    AppConfig appConfig = const AppConfig(),
    this.realtime,
  }) {
    services = AppServices(
      live: LiveUpdates(realtime, accessToken: () async => 'a'),
      placeSearch: placeSearch,
      appConfig: appConfig,
      session: SessionController(auth: auth),
      auth: auth,
      errands: errands,
      payments: payments,
      evidence: evidence,
      ratings: ratings,
      priceChanges: priceChanges,
      disputes: disputes,
      notifications: notifications,
      account: account,
      runners: FakeRunners(),
      pollingEnabled: false,
    );
  }

  final auth = FakeAuth();
  final errands = FakeErrands();
  final payments = FakePayments();
  final evidence = FakeEvidence();
  final ratings = FakeRatings();
  final priceChanges = FakePriceChanges();
  final disputes = FakeDisputes();
  final notifications = FakeNotifications();
  final account = FakeAccount();
  late final AppServices services;

  /// Optional fake socket (live-update tests).
  final FakeRealtime? realtime;

  /// Starts the app. With [signedIn] the session restores straight into the
  /// shell.
  Future<void> pumpApp(WidgetTester tester, {bool signedIn = true}) async {
    if (signedIn) {
      auth.stored = const AuthTokens(accessToken: 'a', refreshToken: 'r');
    }
    await _setUp(tester);
    await tester.pumpWidget(NitumeCustomerApp(services: services));
    await tester.pumpAndSettle();
  }

  /// Pumps [screen] as the only route, inside the app's scope and theme.
  Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
    await _setUp(tester);
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

/// Places stand-in returning one fixed place.
class FakePlaces implements PlaceSearchService {
  @override
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  }) async => const [
    PlaceSuggestion(
      placeId: 'g1',
      primaryText: 'Upper Hill',
      secondaryText: 'Nairobi',
    ),
  ];

  @override
  Future<PlaceDetails> details(
    String placeId, {
    required String sessionToken,
  }) async => const PlaceDetails(
    placeId: 'g1',
    addressText: 'Upper Hill, Nairobi',
    lat: -1.3,
    lng: 36.81,
  );
}

/// In-memory [RealtimeClient] for live-update tests.
class FakeRealtime implements RealtimeClient {
  final _state = StreamController<RealtimeConnectionState>.broadcast();
  final _locations = StreamController<LocationUpdate>.broadcast();
  final _statuses = StreamController<ErrandStatusChanged>.broadcast();
  final _evidence = StreamController<EvidenceUploaded>.broadcast();
  final _prices = StreamController<PriceChangeRequested>.broadcast();
  final _quotes = StreamController<QuoteReissued>.broadcast();
  final _merchants = StreamController<MerchantDetailsUpdated>.broadcast();
  final _merchantChanges = StreamController<MerchantDetailsChanged>.broadcast();
  final _quoteRequests = StreamController<QuoteRequested>.broadcast();
  final _revocations = StreamController<ErrandAccessRevoked>.broadcast();

  void emitMerchantDetailsChanged(String errandId) => _merchantChanges.add(
    MerchantDetailsChanged(errandId: errandId, tillNumber: '654321'),
  );

  void emitQuoteRequested(String errandId) =>
      _quoteRequests.add(QuoteRequested(errandId: errandId));

  void emitAccessRevoked(String errandId) =>
      _revocations.add(ErrandAccessRevoked(errandId: errandId));

  @override
  Stream<MerchantDetailsChanged> get merchantDetailsChanges =>
      _merchantChanges.stream;

  @override
  Stream<QuoteRequested> get quoteRequests => _quoteRequests.stream;

  @override
  Stream<ErrandAccessRevoked> get accessRevocations => _revocations.stream;

  void emitQuoteReissued(String errandId) => _quotes.add(
    QuoteReissued(errandId: errandId, quoteId: 'q2', total: '2500.00'),
  );

  void emitMerchantDetails(String errandId) => _merchants.add(
    MerchantDetailsUpdated(errandId: errandId, tillNumber: '123456'),
  );

  @override
  Stream<QuoteReissued> get quoteReissues => _quotes.stream;

  @override
  Stream<MerchantDetailsUpdated> get merchantDetailsUpdates =>
      _merchants.stream;
  RealtimeConnectionState _current = RealtimeConnectionState.disconnected;
  final joined = <String>{};

  void setState(RealtimeConnectionState s) {
    _current = s;
    _state.add(s);
  }

  void emitStatus(String errandId, ErrandStatus status) =>
      _statuses.add(ErrandStatusChanged(errandId: errandId, status: status));

  void emitLocation(String errandId, GeoPoint p) =>
      _locations.add(LocationUpdate(errandId: errandId, point: p));

  void emitPriceChange(String errandId) => _prices.add(
    PriceChangeRequested(
      errandId: errandId,
      requestId: 'pc1',
      fromPrice: '40000.00',
      toPrice: '45000.00',
    ),
  );

  @override
  Future<void> connect({required String accessToken}) async =>
      setState(RealtimeConnectionState.connected);

  @override
  Future<void> disconnect() async =>
      setState(RealtimeConnectionState.disconnected);

  @override
  Stream<RealtimeConnectionState> get connectionState => _state.stream;

  @override
  RealtimeConnectionState get currentState => _current;

  @override
  Future<bool> joinErrand(String errandId) async => joined.add(errandId);

  @override
  Future<void> leaveErrand(String errandId) async => joined.remove(errandId);

  @override
  Stream<LocationUpdate> get locationUpdates => _locations.stream;

  @override
  Stream<ErrandStatusChanged> get statusChanges => _statuses.stream;

  @override
  Stream<EvidenceUploaded> get evidenceUploads => _evidence.stream;

  @override
  Stream<PriceChangeRequested> get priceChangeRequests => _prices.stream;
}
