import 'dart:convert';
import 'dart:typed_data';

import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/errand.dart';
import '../models/errand_activity.dart';
import '../models/errand_details.dart';
import '../models/json_utils.dart';
import '../models/runner_account.dart';
import 'errand_activity_repositories.dart';
import 'errand_repository.dart';

/// R-19. The signed-in runner's account (`/runners/me*`), endpoints that
/// exist on `main`.
///
/// Not here yet: job offers / decline (RA-1, owner row 113). The payout
/// ledger and payout requests are on `RunnerPayoutRepository`.
class RunnerAccountRepository {
  RunnerAccountRepository(this._api);

  final NitumeApiClient _api;

  /// `GET /runners/me`.
  Future<RunnerMe> me() => _api.getMap('/runners/me').then(RunnerMe.fromJson);

  /// `PATCH /runners/me/availability`. Send only [RunnerAvailability.online]
  /// or [RunnerAvailability.offline]; `busy` is meant to be server-set
  /// (RA-20). The API does not yet refuse unverified runners (RA-8): the
  /// screen must still gate the switch.
  Future<RunnerMe> setAvailability(RunnerAvailability availability) => _api
      .patchMap(
        '/runners/me/availability',
        data: {'availability': availability.wire},
      )
      .then(RunnerMe.fromJson);

  /// `GET /runners/me/verifications`, newest first.
  Future<List<RunnerVerification>> verifications() async =>
      asJsonList(await _api.getList('/runners/me/verifications'))
          .map(RunnerVerification.fromJson)
          .toList();

  /// `POST /runners/me/verifications`: creates a `pending` record.
  /// [documentKey] is the stored document's key (one key only today; the
  /// document upload itself is RA-7, not built).
  Future<RunnerVerification> addVerification(
    RunnerVerificationType type, {
    String? documentKey,
  }) => _api
      .postMap(
        '/runners/me/verifications',
        data: {'verificationType': type.wire, 'documentS3Key': ?documentKey},
      )
      .then(RunnerVerification.fromJson);

  /// `PUT /runners/me/skills` (1–20). Returns the saved skills. The skill
  /// vocabulary is RQ-3 (open).
  Future<List<RunnerSkill>> setSkills(List<RunnerSkill> skills) async {
    final data = await _api.put(
      '/runners/me/skills',
      data: {
        'skills': [for (final s in skills) s.wire],
      },
    );
    return [
      for (final s in (data as List? ?? const [])) RunnerSkill.fromWire('$s'),
    ];
  }

  /// `PUT /runners/me/service-areas` (≤ 50, each ≤ 64 characters). Returns
  /// the saved, de-duplicated areas. The area list is RQ-4 (open).
  Future<List<String>> setServiceAreas(List<String> areas) async {
    final data = await _api.put(
      '/runners/me/service-areas',
      data: {'areas': areas},
    );
    return [for (final a in (data as List? ?? const [])) '$a'];
  }
}

/// R-19. The runner's job: list, detail, runner transitions, notes,
/// evidence and price-change requests. Endpoints that exist on `main`.
///
/// The detail is the customer-shaped `Errand` until the runner projection
/// lands (RA-2): **never show [Errand.feeTotal] or any customer fee to a
/// runner**. The runner fee, item amount and route are not available yet.
class RunnerJobsRepository {
  RunnerJobsRepository(this._api)
    : _errands = ErrandRepository(_api),
      _evidence = EvidenceRepository(_api),
      _priceChanges = PriceChangeRepository(_api),
      _disputes = DisputesRepository(_api);

  final NitumeApiClient _api;
  final ErrandRepository _errands;
  final EvidenceRepository _evidence;
  final PriceChangeRepository _priceChanges;
  final DisputesRepository _disputes;

  /// `v-active` set (`_shared.md` §6).
  static const activeStatuses = {
    ErrandStatus.runnerAssigned,
    ErrandStatus.runnerEnRoute,
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
    ErrandStatus.awaitingCustomer,
    ErrandStatus.disputed,
  };

  /// Finished set (`_shared.md` §6).
  static const finishedStatuses = {
    ErrandStatus.completed,
    ErrandStatus.confirmed,
    ErrandStatus.settled,
    ErrandStatus.cancelled,
    ErrandStatus.failed,
    ErrandStatus.expired,
  };

  /// Transitions the runner may fire (§3.3, actor R). The API enforces
  /// them; screens use this to show only allowed actions.
  static const runnerTransitions = <ErrandStatus, Set<ErrandStatus>>{
    ErrandStatus.runnerAssigned: {ErrandStatus.runnerEnRoute},
    ErrandStatus.runnerEnRoute: {ErrandStatus.arrived, ErrandStatus.failed},
    ErrandStatus.arrived: {ErrandStatus.inProgress},
    ErrandStatus.inProgress: {ErrandStatus.awaitingCustomer},
  };

  /// States where `PATCH /errands/:id/runner-notes` is accepted.
  static const runnerNotesStatuses = {
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
    ErrandStatus.awaitingCustomer,
  };

  /// The runner's current job(s): `GET /errands?status=…` (runner-scoped
  /// to the current assignment by the API).
  Future<List<Errand>> activeJobs() async =>
      (await _errands.list(statuses: activeStatuses)).items;

  /// `GET /errands/:id` (customer shape, see the class note).
  Future<Errand> get(String errandId) => _errands.get(errandId);

  /// `GET /errands/:id/history`, oldest first (arrival time and actor).
  Future<List<StatusHistoryEntry>> history(String errandId) =>
      _errands.history(errandId);

  /// Runner transition, `PATCH /errands/:id/status` `{ to, note? }`.
  /// Throws [ArgumentError] unless it is a runner transition; the API also
  /// checks the actor.
  /// [note] (≤ 500) carries the reason for RUNNER_EN_ROUTE → FAILED.
  Future<ErrandTransitionResult> transition(
    String errandId, {
    required ErrandStatus from,
    required ErrandStatus to,
    String? note,
  }) {
    if (!(runnerTransitions[from]?.contains(to) ?? false)) {
      throw ArgumentError('Not a runner transition: ${from.wire} → ${to.wire}');
    }
    return _errands.transition(errandId, to, note: note);
  }

  /// `PATCH /errands/:id/runner-notes` (≤ 2000 characters; `null` clears).
  Future<Errand> updateRunnerNotes(String errandId, String? notes) async =>
      Errand.fromJson(
        await _api.patchMap(
          '/errands/$errandId/runner-notes',
          data: {'runnerNotes': notes},
        ),
      );

  /// `GET /errands/:id/evidence` (signed URLs, row 25).
  Future<List<Evidence>> evidence(String errandId) => _evidence.list(errandId);

  /// `POST /errands/:id/evidence`: one capture as base64 JSON. Photos and
  /// receipts only for runners (video deferred, row 32).
  ///
  /// RA-11: the API's default JSON body limit refuses normal photos until
  /// it is raised or a signed upload is added; expect a 413 meanwhile.
  Future<Evidence> uploadEvidence(
    String errandId, {
    required EvidenceType type,
    required Uint8List bytes,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
  }) {
    if (type != EvidenceType.photo && type != EvidenceType.receipt) {
      throw ArgumentError.value(
        type,
        'type',
        'Runners upload photos and receipts only',
      );
    }
    return _api
        .postMap(
          '/errands/$errandId/evidence',
          data: {
            'type': type.wire,
            'data': base64Encode(bytes),
            'contentType': contentType,
            'capturedAt': ?capturedAt?.toUtc().toIso8601String(),
            'lat': ?lat,
            'lon': ?lon,
          },
        )
        .then(Evidence.fromJson);
  }

  /// `GET /errands/:id/price-change` (optionally one status).
  Future<List<PriceChangeRequest>> priceChanges(
    String errandId, {
    PriceChangeStatus? status,
  }) => _priceChanges.list(errandId, status: status);

  /// The request still waiting for the customer, if any.
  Future<PriceChangeRequest?> pendingPriceChange(String errandId) =>
      _priceChanges.pending(errandId);

  /// `POST /errands/:id/price-change` `{ toPrice, reason }`: IN_PROGRESS,
  /// Buy For Me / Get It For Me only (rows 49, 101). Changes the item
  /// amount only. Errors: `price_change_already_pending`,
  /// `merchant_amount_not_applicable`, `price_change_not_in_progress`.
  Future<PriceChangeRequest> requestPriceChange(
    String errandId, {
    required num toPrice,
    String? reason,
  }) => _api
      .postMap(
        '/errands/$errandId/price-change',
        data: {'toPrice': toPrice, 'reason': ?reason},
      )
      .then(PriceChangeRequest.fromJson);

  /// `GET /errands/:id/dispute` (runner sees the resolution note, row 79);
  /// `null` when none.
  Future<Dispute?> dispute(String errandId) => _disputes.forErrand(errandId);
}
