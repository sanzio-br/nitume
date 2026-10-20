import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/app.dart';
import 'package:runner_app/src/navigation/routes.dart';
import 'package:runner_app/src/services/app_services.dart';
import 'package:runner_app/src/services/capture_files.dart';
import 'package:runner_app/src/services/runner_live.dart';
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

/// Fixed test time: 2026-10-19 10:00 EAT.
final testNow = DateTime.utc(2026, 10, 19, 7);

NitumeApiException apiError(String? code, {int status = 409}) =>
    NitumeApiException(
      message: code ?? 'error',
      statusCode: status,
      code: code,
    );

const networkError = NitumeApiException(
  message: 'offline',
  isNetworkError: true,
);

RunnerVerificationCheck check(
  RunnerVerificationType type,
  VerificationCheckStatus status, {
  VerificationDocumentSide? side,
}) => RunnerVerificationCheck(type: type, status: status, side: side);

/// A verified (all checks approved) summary, or one with [status] on every
/// check.
RunnerVerificationSummary summary({
  VerificationCheckStatus status = VerificationCheckStatus.approved,
}) => RunnerVerificationSummary(
  verified: status == VerificationCheckStatus.approved,
  checks: [
    check(RunnerVerificationType.phone, VerificationCheckStatus.approved),
    check(
      RunnerVerificationType.governmentId,
      status,
      side: VerificationDocumentSide.front,
    ),
    check(
      RunnerVerificationType.governmentId,
      status,
      side: VerificationDocumentSide.back,
    ),
    check(RunnerVerificationType.selfie, status),
    check(RunnerVerificationType.paymentIdentity, status),
  ],
);

RunnerMe runnerMe({
  RunnerAvailability availability = RunnerAvailability.online,
  RunnerVerificationSummary? verification,
  List<ServiceAreaOption> areas = const [
    ServiceAreaOption(id: 'nyali', name: 'Nyali'),
    ServiceAreaOption(id: 'bamburi', name: 'Bamburi'),
  ],
  String maxPurchaseAdvance = '3000.00',
}) => RunnerMe(
  id: 'rp1',
  userId: 'u1',
  displayName: 'Brian Kamau',
  shortName: 'Brian K.',
  verificationLevel: VerificationLevel.idVerified,
  availability: availability,
  avgRating: '4.90',
  errandsCompleted: 12,
  completionRate: '98.00',
  maxPurchaseAdvance: maxPurchaseAdvance,
  serviceAreas: areas,
  verification: verification ?? summary(),
);

RunnerVerification verification(
  RunnerVerificationType type,
  VerificationStatus status, {
  VerificationDocumentSide? side,
  String id = 'v',
  DateTime? createdAt,
}) => RunnerVerification(
  id: '$id-${type.wire}-${side?.wire ?? ''}',
  type: type,
  status: status,
  side: side,
  hasDocument: true,
  createdAt: createdAt ?? DateTime.utc(2026, 10, 18),
);

/// An open offer at the Nyali task site.
RunnerJobView offer({
  String id = 'e1',
  String? title = 'Check apartment — Nyali',
  ErrandCategory category = ErrandCategory.checkItForMe,
  String runnerFee = '1750.00',
  String? itemAmount,
  MerchantRoute? merchantRoute,
  bool overPurchaseLimit = false,
  DateTime? offerExpiresAt,
  DateTime? deadlineAt,
  ErrandStatus status = ErrandStatus.runnerAssigned,
  AssignmentStatus assignment = AssignmentStatus.assigned,
  String description = 'Video the compound and both bedrooms.',
  List<ErrandItem> items = const [],
  List<ErrandLocation>? locations,
  String? runnerNotes,
}) {
  final site = ErrandLocation(
    pointType: ErrandPointType.taskSite,
    lat: -4.03,
    lng: 39.72,
    addressText: 'Links Rd, Nyali',
  );
  return RunnerJobView(
    id: id,
    reference: 'NT-$id',
    status: status,
    category: category,
    title: title,
    description: description,
    urgency: ErrandUrgency.standard,
    runnerFee: runnerFee,
    requiredPurchase: merchantRoute == MerchantRoute.sendToRunner
        ? (itemAmount ?? '0.00')
        : '0.00',
    maxPurchaseAdvance: '3000.00',
    overPurchaseLimit: overPurchaseLimit,
    itemAmount: itemAmount,
    merchantRoute: merchantRoute,
    offerExpiresAt: offerExpiresAt,
    deadlineAt: deadlineAt,
    locations: locations ?? [site],
    firstPoint: (locations ?? [site]).first,
    items: items,
    runnerNotes: runnerNotes,
    assignment: RunnerJobAssignment(
      id: 'a-$id',
      status: assignment,
      offerExpiresAt: offerExpiresAt,
    ),
  );
}

/// A job this runner accepted (`GET /runners/me/jobs`).
RunnerJobView heldJob({
  String id = 'e1',
  ErrandStatus status = ErrandStatus.runnerEnRoute,
  String? title = 'Check apartment — Nyali',
  ErrandCategory category = ErrandCategory.checkItForMe,
  String? itemAmount,
  MerchantRoute? merchantRoute,
  DateTime? deadlineAt,
  String? runnerNotes,
  List<ErrandLocation>? locations,
}) => offer(
  id: id,
  status: status,
  title: title,
  category: category,
  itemAmount: itemAmount,
  merchantRoute: merchantRoute,
  deadlineAt: deadlineAt,
  runnerNotes: runnerNotes,
  locations: locations,
  assignment: AssignmentStatus.accepted,
);

Evidence evidenceItem(
  String errandId, {
  String id = 'ev1',
  EvidenceType type = EvidenceType.photo,
}) => Evidence(
  id: id,
  errandId: errandId,
  type: type,
  url: null,
  capturedAt: testNow,
);

StatusHistoryEntry historyEntry(
  String errandId,
  ErrandStatus to, {
  StatusHistoryActor actor = StatusHistoryActor.runner,
  DateTime? at,
}) => StatusHistoryEntry(
  id: 'h-${to.wire}',
  errandId: errandId,
  toStatus: to,
  actorType: actor,
  createdAt: at ?? testNow,
);

Errand errand({
  String id = 'e9',
  ErrandStatus status = ErrandStatus.runnerEnRoute,
  String? title = 'Pick up documents',
}) => Errand(
  id: id,
  customerId: 'c1',
  category: ErrandCategory.getItForMe,
  description: 'Docs',
  status: status,
  urgency: ErrandUrgency.standard,
  budget: '0.00',
  title: title,
);

class FakeRunnerAccount extends RunnerAccountRepository {
  FakeRunnerAccount() : super(_api);

  RunnerMe current = runnerMe();
  Object? meError;
  List<RunnerVerification> records = [
    verification(RunnerVerificationType.phone, VerificationStatus.approved),
    verification(
      RunnerVerificationType.governmentId,
      VerificationStatus.approved,
      side: VerificationDocumentSide.front,
    ),
    verification(
      RunnerVerificationType.governmentId,
      VerificationStatus.approved,
      side: VerificationDocumentSide.back,
    ),
    verification(RunnerVerificationType.selfie, VerificationStatus.approved),
    verification(
      RunnerVerificationType.paymentIdentity,
      VerificationStatus.approved,
    ),
  ];
  Object? recordsError;
  final availabilityCalls = <RunnerAvailability>[];
  Object? availabilityError;
  final uploads = <(RunnerVerificationType, VerificationDocumentSide?, int)>[];

  /// Errors for the next uploads, in order (`null` = success).
  final uploadErrors = <Object?>[];

  int paymentIdentityCalls = 0;
  Object? paymentIdentityError;

  @override
  Future<RunnerVerification> ensurePaymentIdentityVerification() async {
    paymentIdentityCalls++;
    final e = paymentIdentityError;
    if (e != null) throw e;
    return verification(
      RunnerVerificationType.paymentIdentity,
      VerificationStatus.pending,
    );
  }

  /// Completes the next upload when set (to observe the uploading state).
  Completer<void>? uploadGate;
  int meCalls = 0;

  @override
  Future<RunnerMe> me() async {
    meCalls++;
    final e = meError;
    if (e != null) throw e;
    return current;
  }

  @override
  Future<RunnerMe> setAvailability(RunnerAvailability availability) async {
    availabilityCalls.add(availability);
    final e = availabilityError;
    if (e != null) throw e;
    current = runnerMe(
      availability: availability,
      verification: current.verification,
      areas: current.serviceAreas,
    );
    return current;
  }

  @override
  Future<List<RunnerVerification>> verifications() async {
    final e = recordsError;
    if (e != null) throw e;
    return records;
  }

  @override
  Future<RunnerVerification> uploadVerificationDocument(
    RunnerVerificationType type, {
    required Uint8List bytes,
    required String contentType,
    VerificationDocumentSide? side,
    String? filename,
  }) async {
    uploads.add((type, side, bytes.length));
    final gate = uploadGate;
    if (gate != null) await gate.future;
    if (uploadErrors.isNotEmpty) {
      final e = uploadErrors.removeAt(0);
      if (e != null) throw e;
    }
    return verification(type, VerificationStatus.pending, side: side);
  }
}

class FakeRunnerJobs extends RunnerJobsRepository {
  FakeRunnerJobs() : super(_api);

  List<RunnerJobView> offerList = [];
  Object? offersError;
  int offersCalls = 0;
  List<Errand> active = [];
  final accepted = <String>[];
  Object? acceptError;
  final declined = <(String, OfferDeclineReason?)>[];
  Object? declineError;
  final jobs = <String, RunnerJobView>{};
  Object? jobError;

  @override
  Future<RunnerOffersPage> offers({int? limit, String? cursor}) async {
    offersCalls++;
    final e = offersError;
    if (e != null) throw e;
    return RunnerOffersPage(items: List.of(offerList));
  }

  @override
  Future<RunnerJobView> job(String errandId) async {
    final e = jobError;
    if (e != null) throw e;
    return jobs[errandId] ??
        offerList.firstWhere(
          (o) => o.id == errandId,
          orElse: () => throw apiError(null, status: 403),
        );
  }

  @override
  Future<OfferAcceptResult> accept(String errandId) async {
    accepted.add(errandId);
    final e = acceptError;
    if (e != null) throw e;
    final o = offerList.firstWhere((o) => o.id == errandId);
    offerList.removeWhere((x) => x.id == errandId);
    return OfferAcceptResult(
      job: o,
      history: StatusHistoryEntry(
        id: 'h1',
        errandId: errandId,
        fromStatus: ErrandStatus.runnerAssigned,
        toStatus: ErrandStatus.runnerEnRoute,
        actorType: StatusHistoryActor.runner,
      ),
    );
  }

  @override
  Future<OfferDeclineResult> decline(
    String errandId, {
    OfferDeclineReason? reason,
  }) async {
    declined.add((errandId, reason));
    final e = declineError;
    if (e != null) throw e;
    offerList.removeWhere((x) => x.id == errandId);
    return OfferDeclineResult(
      errandId: errandId,
      assignmentId: 'a-$errandId',
      requiredPurchase: '0.00',
      maxPurchaseAdvance: '3000.00',
      overLimit: false,
      declineReason: reason,
    );
  }

  @override
  Future<List<Errand>> activeJobs() async => active;

  // v-active family.
  List<RunnerJobView> heldList = [];
  Object? heldError;
  int heldCalls = 0;
  final transitions = <(String, ErrandStatus, String?)>[];

  /// Errors for the next transitions, in order (`null` = success).
  final transitionErrors = <Object?>[];
  final notes = <(String, String?)>[];
  Object? notesError;
  final evidenceById = <String, List<Evidence>>{};
  final evidenceUploads = <(String, EvidenceType)>[];
  final evidenceErrors = <Object?>[];
  final historyById = <String, List<StatusHistoryEntry>>{};
  final pendingById = <String, PriceChangeRequest?>{};
  final priceRequests = <(String, num, String?)>[];
  Object? priceError;
  final disputeById = <String, Dispute?>{};

  @override
  Future<List<RunnerJobView>> heldJobs() async {
    heldCalls++;
    final e = heldError;
    if (e != null) throw e;
    return [
      ...heldList.where(
        (j) => RunnerJobsRepository.workingStatuses.contains(j.status),
      ),
      ...heldList.where(
        (j) => !RunnerJobsRepository.workingStatuses.contains(j.status),
      ),
    ];
  }

  void setStatus(String id, ErrandStatus status) {
    heldList = [
      for (final j in heldList)
        if (j.id == id)
          heldJob(
            id: j.id,
            status: status,
            title: j.title,
            category: j.category,
            itemAmount: j.itemAmount,
            merchantRoute: j.merchantRoute,
            deadlineAt: j.deadlineAt,
            runnerNotes: j.runnerNotes,
            locations: j.locations,
          )
        else
          j,
    ];
  }

  @override
  Future<ErrandTransitionResult> transition(
    String errandId, {
    required ErrandStatus from,
    required ErrandStatus to,
    String? note,
    String? idempotencyKey,
  }) async {
    transitions.add((errandId, to, note));
    if (transitionErrors.isNotEmpty) {
      final e = transitionErrors.removeAt(0);
      if (e != null) throw e;
    }
    setStatus(errandId, to);
    return ErrandTransitionResult(
      errand: errand(id: errandId, status: to),
      history: historyEntry(errandId, to),
    );
  }

  @override
  Future<Errand> updateRunnerNotes(
    String errandId,
    String? notes, {
    String? idempotencyKey,
  }) async {
    this.notes.add((errandId, notes));
    final e = notesError;
    if (e != null) throw e;
    heldList = [
      for (final j in heldList)
        if (j.id == errandId)
          heldJob(
            id: j.id,
            status: j.status,
            title: j.title,
            category: j.category,
            itemAmount: j.itemAmount,
            merchantRoute: j.merchantRoute,
            deadlineAt: j.deadlineAt,
            runnerNotes: notes,
            locations: j.locations,
          )
        else
          j,
    ];
    return errand(id: errandId);
  }

  @override
  Future<List<Evidence>> evidence(String errandId) async =>
      evidenceById[errandId] ?? const [];

  @override
  Future<Evidence> uploadEvidence(
    String errandId, {
    required EvidenceType type,
    required Uint8List bytes,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
    String? idempotencyKey,
  }) async {
    evidenceUploads.add((errandId, type));
    if (evidenceErrors.isNotEmpty) {
      final e = evidenceErrors.removeAt(0);
      if (e != null) throw e;
    }
    final ev = evidenceItem(
      errandId,
      id: 'ev${evidenceUploads.length}',
      type: type,
    );
    (evidenceById[errandId] ??= []).add(ev);
    return ev;
  }

  @override
  Future<List<StatusHistoryEntry>> history(String errandId) async =>
      historyById[errandId] ?? const [];

  @override
  Future<PriceChangeRequest?> pendingPriceChange(String errandId) async =>
      pendingById[errandId];

  @override
  Future<PriceChangeRequest> requestPriceChange(
    String errandId, {
    required num toPrice,
    String? reason,
  }) async {
    priceRequests.add((errandId, toPrice, reason));
    final e = priceError;
    if (e != null) throw e;
    final r = PriceChangeRequest(
      id: 'pc1',
      errandId: errandId,
      requestedByUserId: 'u1',
      fromPrice: '40000.00',
      toPrice: toPrice.toStringAsFixed(2),
      status: PriceChangeStatus.requested,
      reason: reason,
    );
    pendingById[errandId] = r;
    return r;
  }

  @override
  Future<Dispute?> dispute(String errandId) async => disputeById[errandId];
}

class FakePayouts extends RunnerPayoutRepository {
  FakePayouts()
    : super(_api, keys: PaymentAttemptKeys(InMemoryIdempotencyKeyStore()));

  final linesById = <String, List<PayoutFeedItem>>{};
  final claims = <(String, num, String, String?)>[];
  Object? claimError;

  @override
  Future<PayoutFeedPage> payoutLines({
    Set<PayoutFeedKind>? kinds,
    String? errandId,
    String? cursor,
    int? limit,
  }) async => PayoutFeedPage(items: linesById[errandId] ?? const []);

  @override
  Future<PayoutFeedItem> claimReimbursement({
    required String errandId,
    required num amount,
    required String receiptEvidenceId,
    String? note,
  }) async {
    claims.add((errandId, amount, receiptEvidenceId, note));
    final e = claimError;
    if (e != null) throw e;
    return PayoutFeedItem(
      id: 'l1',
      kind: PayoutFeedKind.itemReimbursement,
      kindWire: 'item_reimbursement',
      status: PayoutLineStatus.onHold,
      amount: amount.toStringAsFixed(2),
      errandId: errandId,
    );
  }
}

/// Socket fake: both client interfaces, events pushed by the test.
class FakeRealtime implements RealtimeClient, RunnerRealtimeClient {
  final _state = StreamController<RealtimeConnectionState>.broadcast();
  RealtimeConnectionState _current = RealtimeConnectionState.disconnected;
  final joined = <String>{};
  final pings = <LocationPing>[];
  LocationPingAck ack = const LocationPingAck(ok: true);
  final status = StreamController<ErrandStatusChanged>.broadcast();
  final revoked = StreamController<ErrandAccessRevoked>.broadcast();
  final offered = StreamController<JobOffered>.broadcast();
  final withdrawn = StreamController<JobOfferWithdrawn>.broadcast();
  final decided = StreamController<PriceChangeDecided>.broadcast();
  final evidence = StreamController<EvidenceUploaded>.broadcast();

  void setState(RealtimeConnectionState s) {
    _current = s;
    _state.add(s);
  }

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
  Stream<LocationUpdate> get locationUpdates => const Stream.empty();
  @override
  Stream<ErrandStatusChanged> get statusChanges => status.stream;
  @override
  Stream<EvidenceUploaded> get evidenceUploads => evidence.stream;
  @override
  Stream<PriceChangeRequested> get priceChangeRequests => const Stream.empty();
  @override
  Stream<QuoteReissued> get quoteReissues => const Stream.empty();
  @override
  Stream<MerchantDetailsUpdated> get merchantDetailsUpdates =>
      const Stream.empty();
  @override
  Stream<MerchantDetailsChanged> get merchantDetailsChanges =>
      const Stream.empty();
  @override
  Stream<QuoteRequested> get quoteRequests => const Stream.empty();
  @override
  Stream<ErrandAccessRevoked> get accessRevocations => revoked.stream;
  @override
  Stream<JobOffered> get jobOffers => offered.stream;
  @override
  Stream<JobOfferWithdrawn> get jobOfferWithdrawals => withdrawn.stream;
  @override
  Stream<PriceChangeDecided> get priceChangeDecisions => decided.stream;

  @override
  Future<LocationPingAck> sendLocationPing(LocationPing ping) async {
    pings.add(ping);
    return ack;
  }
}

class FakeNotifications extends NotificationsRepository {
  FakeNotifications() : super(_api);

  int unread = 0;

  @override
  Future<int> unreadCount() async => unread;
}

/// A capture that records [discard] instead of touching the file system.
class _FakeCaptured extends CapturedImage {
  const _FakeCaptured(this.owner, {required super.path, super.contentType});

  final FakeCapture owner;

  @override
  Future<void> discard() async => owner.discarded.add(path);
}

/// Returns [next] (a path) for every capture; records the source and every
/// discarded capture.
class FakeCapture implements ImageCaptureSource {
  String? next = '/app/capture-1.jpg';
  String contentType = 'image/jpeg';
  final calls = <CaptureFrom>[];
  final discarded = <String>[];

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    calls.add(from);
    final p = next;
    return p == null
        ? null
        : _FakeCaptured(this, path: p, contentType: contentType);
  }
}

/// A 1×1 PNG, so photo previews decode in tests.
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

/// In-memory files: every path reads a small PNG, or [size] bytes when set.
class FakeFiles implements CaptureFiles {
  int? size;

  @override
  Future<Uint8List> read(String path) async {
    final n = size;
    return n == null ? _png : Uint8List(n);
  }
}

class FakeLocation implements PositionSource {
  LocationAccess accessNow = LocationAccess.whileInUse;
  LocationAccess afterRequest = LocationAccess.whileInUse;
  DevicePosition? fix = DevicePosition(
    lat: -4.03,
    lng: 39.709,
    timestamp: DateTime.utc(2026, 10, 19, 7),
  );
  int requests = 0;
  int currentCalls = 0;

  @override
  Future<LocationAccess> access() async => accessNow;

  @override
  Future<LocationAccess> requestAccess() async {
    requests++;
    accessNow = afterRequest;
    return accessNow;
  }

  @override
  Future<DevicePosition?> current() async {
    currentCalls++;
    return fix;
  }

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) => const Stream.empty();
}

class FakePermissions implements DevicePermissions {
  int settingsOpened = 0;

  @override
  Future<CameraAccess> camera() async => CameraAccess.granted;

  @override
  Future<CameraAccess> requestCamera() async => CameraAccess.granted;

  @override
  Future<bool> openSettings() async {
    settingsOpened++;
    return true;
  }
}

/// All fakes plus the [AppServices] built from them.
class TestBackend {
  TestBackend({AppConfig appConfig = const AppConfig()}) {
    services = AppServices(
      session: SessionController(auth: auth, push: push),
      auth: auth,
      account: account,
      jobs: jobs,
      notifications: notifications,
      capture: capture,
      location: location,
      permissions: permissions,
      files: files,
      payouts: payouts,
      live: RunnerLive(
        client: realtime,
        runner: realtime,
        accessToken: () async => 'a',
      ),
      appConfig: appConfig,
      clock: () => now,
    );
  }

  final auth = FakeAuth();
  final push = FakePushRegistrar();
  final account = FakeRunnerAccount();
  final jobs = FakeRunnerJobs();
  final notifications = FakeNotifications();
  final capture = FakeCapture();
  final location = FakeLocation();
  final permissions = FakePermissions();
  final files = FakeFiles();
  final payouts = FakePayouts();
  final realtime = FakeRealtime();
  DateTime now = testNow;
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
