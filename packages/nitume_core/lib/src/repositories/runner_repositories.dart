import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart' show DioMediaType, FormData, MultipartFile;

import '../api/api_exception.dart';
import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/errand.dart';
import '../models/errand_activity.dart';
import '../models/errand_details.dart';
import '../models/json_utils.dart';
import '../models/runner_account.dart';
import '../models/runner_job.dart';
import 'errand_activity_repositories.dart';
import 'errand_repository.dart';

/// R-19. The signed-in runner's account (`/runners/me*`, service areas).
///
/// Offers, accept and decline are on [RunnerJobsRepository]. The payout
/// ledger and payout requests are on `RunnerPayoutRepository`.
class RunnerAccountRepository {
  RunnerAccountRepository(this._api);

  final NitumeApiClient _api;

  /// `GET /runners/me`: the runner's own view (RA-18). 404 without a
  /// runner profile.
  Future<RunnerMe> me() => _api.getMap('/runners/me').then(RunnerMe.fromJson);

  /// `PATCH /runners/me/availability` `{ availability }` → the updated
  /// [RunnerMe] (RA-8, RA-20). Only [RunnerAvailability.online] or
  /// [RunnerAvailability.offline]: `busy` is server-set and fails with
  /// [ArgumentError] before sending. Sending `online` while busy changes
  /// nothing.
  ///
  /// API errors (`NitumeApiException.code`):
  /// - 400 [ApiErrorCodes.availabilityServerManaged] (`allowed`);
  /// - 403 [ApiErrorCodes.runnerNotVerified]: going online before every
  ///   required check is approved (`NitumeApiException.verificationSummary`);
  /// - 409 [ApiErrorCodes.runnerOnActiveJob]: going offline while busy.
  Future<RunnerMe> setAvailability(RunnerAvailability availability) async {
    if (availability == RunnerAvailability.busy) {
      throw ArgumentError.value(
        availability,
        'availability',
        'Busy is set by the server',
      );
    }
    return RunnerMe.fromJson(
      await _api.patchMap(
        '/runners/me/availability',
        data: {'availability': availability.wire},
      ),
    );
  }

  /// `GET /runners/me/verifications`, newest first.
  Future<List<RunnerVerification>> verifications() async =>
      asJsonList(await _api.getList('/runners/me/verifications'))
          .map(RunnerVerification.fromJson)
          .toList();

  /// `POST /runners/me/verifications`: creates a `pending` record without an
  /// image (e.g. payment identity). ID and selfie images go through
  /// [uploadVerificationDocument]; the API refuses them here with 400
  /// `verification_document_upload_required` (row 154).
  Future<RunnerVerification> addVerification(RunnerVerificationType type) {
    if (VerificationDocumentRules.uploadableTypes.contains(type)) {
      throw ArgumentError.value(
        type,
        'type',
        'Upload ID and selfie images with uploadVerificationDocument',
      );
    }
    return _api
        .postMap(
          '/runners/me/verifications',
          data: {'verificationType': type.wire},
        )
        .then(RunnerVerification.fromJson);
  }

  /// Interim payment-identity record (rows 218, 222; S-1): makes sure a
  /// `payment_identity` verification is pending or approved so ops can do
  /// the M-Pesa name match. Reads `GET /runners/me/verifications`; when the
  /// newest `payment_identity` record is pending or approved it is returned
  /// and nothing is sent, otherwise (none, or the newest was rejected)
  /// `POST /runners/me/verifications` `{ verificationType:
  /// 'payment_identity' }` creates a pending one. The API itself does not
  /// de-duplicate, so always go through this call, never [addVerification].
  ///
  /// `v-onboard-selfie` calls it on `Submit for review →` (placement is the
  /// screen's). Errors are the API's ([NitumeApiException]); a failed call
  /// leaves the uploaded selfie as it is.
  Future<RunnerVerification> ensurePaymentIdentityVerification() async {
    final latest = RunnerVerification.latestByType(await verifications());
    final current = latest[RunnerVerificationType.paymentIdentity];
    if (current != null && current.status != VerificationStatus.rejected) {
      return current;
    }
    return addVerification(RunnerVerificationType.paymentIdentity);
  }

  /// `POST /runners/me/verifications/documents` (multipart: `file`,
  /// `verificationType` and, for an ID, `side`): stores one ID side or
  /// selfie in restricted storage and creates a `pending` record (rows 125,
  /// 154). One call per image: ID front and back are two calls with
  /// [RunnerVerificationType.governmentId] and [side]
  /// [VerificationDocumentSide.front] / [VerificationDocumentSide.back]
  /// (rows 195, 200).
  ///
  /// Throws [ArgumentError] before sending when [type] is not uploadable,
  /// [side] is missing for a government ID or given for a selfie, [bytes]
  /// is empty or above [VerificationDocumentRules.maxBytes] (row 163), or
  /// [contentType] is not an accepted image type. API errors
  /// (`NitumeApiException.code`): `verification_type_not_uploadable`,
  /// `verification_document_side_invalid` (`allowed`),
  /// `verification_document_type_invalid` (`allowed`),
  /// `verification_document_empty`; a 413 above the server limit
  /// (`NitumeApiException.isPayloadTooLarge`; code
  /// `verification_document_too_large` with `maxBytes` when sent).
  Future<RunnerVerification> uploadVerificationDocument(
    RunnerVerificationType type, {
    required Uint8List bytes,
    required String contentType,
    VerificationDocumentSide? side,
    String? filename,
  }) {
    if (!VerificationDocumentRules.uploadableTypes.contains(type)) {
      throw ArgumentError.value(type, 'type', 'Only ID and selfie images');
    }
    if (type == RunnerVerificationType.governmentId && side == null) {
      throw ArgumentError.notNull('side');
    }
    if (type != RunnerVerificationType.governmentId && side != null) {
      throw ArgumentError.value(side, 'side', 'Only sent with an ID image');
    }
    if (!VerificationDocumentRules.fitsSizeLimit(bytes.length)) {
      throw ArgumentError.value(
        bytes.length,
        'bytes',
        'must be 1 byte to ${VerificationDocumentRules.maxBytes} bytes',
      );
    }
    if (!VerificationDocumentRules.isAcceptedContentType(contentType)) {
      throw ArgumentError.value(
        contentType,
        'contentType',
        'must be a JPEG, PNG, WebP or HEIC image',
      );
    }
    final form = FormData.fromMap({
      'verificationType': type.wire,
      if (side != null) 'side': side.wire,
      'file': MultipartFile.fromBytes(
        bytes,
        filename:
            filename ??
            '${type.wire}${side == null ? '' : '_${side.wire}'}'
                '${_extensionFor(contentType)}',
        contentType: DioMediaType.parse(contentType),
      ),
    });
    return _api
        .postMap('/runners/me/verifications/documents', data: form)
        .then(RunnerVerification.fromJson);
  }

  static String _extensionFor(String contentType) =>
      switch (contentType.split(';').first.trim().toLowerCase()) {
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/heic' => '.heic',
        'image/heif' => '.heif',
        _ => '.jpg',
      };

  /// Most skills `PUT /runners/me/skills` takes (row 115).
  static const maxSkills = 5;

  /// Most service areas `PUT /runners/me/service-areas` takes.
  static const maxServiceAreas = 50;

  /// `PUT /runners/me/skills` `{ skills }`: replaces the runner's skills
  /// with 1–[maxSkills] distinct values (row 115). Returns the saved skills
  /// in category order. Throws [ArgumentError] before sending when there
  /// are none or more than [maxSkills].
  ///
  /// API error: 400 [ApiErrorCodes.skillNotOffered] for a skill outside
  /// [RunnerSkill.offered] (`refused`, `allowed`).
  Future<List<RunnerSkill>> setSkills(List<RunnerSkill> skills) async {
    final unique = skills.toSet();
    if (unique.isEmpty || unique.length > maxSkills) {
      throw ArgumentError.value(
        skills,
        'skills',
        'Choose 1 to $maxSkills skills',
      );
    }
    final data = await _api.put(
      '/runners/me/skills',
      data: {
        'skills': [for (final s in unique) s.wire],
      },
    );
    return RunnerSkill.listFromWire(data);
  }

  /// `GET /runners/service-areas`: the ops-configured areas, by name (row
  /// 116). Offer these in the area picker.
  Future<List<ServiceAreaOption>> serviceAreas() async {
    final data = await _api.getMap('/runners/service-areas');
    return ServiceAreaOption.listFromJson(data['items']);
  }

  /// `PUT /runners/me/service-areas` `{ areas: ids }`: replaces the runner's
  /// areas with 0–[maxServiceAreas] [ServiceAreaOption.id]s from
  /// [serviceAreas]. Returns the saved areas by name. Throws [ArgumentError]
  /// before sending above [maxServiceAreas].
  ///
  /// API error: 400 [ApiErrorCodes.serviceAreaUnknown] for an id not on the
  /// list (`NitumeApiException.unknownServiceAreas`).
  Future<List<ServiceAreaOption>> setServiceAreas(List<String> areaIds) async {
    final unique = areaIds.toSet().toList();
    if (unique.length > maxServiceAreas) {
      throw ArgumentError.value(
        areaIds,
        'areaIds',
        'At most $maxServiceAreas areas',
      );
    }
    final data = await _api.put(
      '/runners/me/service-areas',
      data: {'areas': unique},
    );
    return ServiceAreaOption.listFromJson(data);
  }
}

/// R-19. The runner's offers and jobs: offers, the runner job view,
/// accept / decline, runner transitions, notes, evidence and price-change
/// requests.
///
/// Read the job through [job] / [readJob] / [heldJobs] / [offers]
/// ([RunnerJobView], RA-2): it has the runner fee, item amount and route
/// and no customer fees. [get] and [activeJobs] return the customer-shaped
/// `Errand`: **never show [Errand.feeTotal] or any customer fee to a
/// runner**.
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

  /// Working states (row 211): the runner is busy and gets job pings. A
  /// runner holds at most one job in this set. Mirrors the API's
  /// `RUNNER_ACTIVE_JOB_STATES`.
  static const workingStatuses = {
    ErrandStatus.runnerEnRoute,
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
  };

  /// `v-active` set (`_shared.md` §6): accepted jobs only, i.e.
  /// [workingStatuses] plus AWAITING_CUSTOMER and DISPUTED. RUNNER_ASSIGNED
  /// is an open offer (`v-jobs` / `v-job-detail`) and is not in it.
  static const activeStatuses = {
    ErrandStatus.runnerEnRoute,
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
    ErrandStatus.awaitingCustomer,
    ErrandStatus.disputed,
  };

  /// Ended states a held job stays listed by [heldJobsPage] for
  /// [endedJobWindow] (CANCELLED / FAILED: the receipt window, row 129;
  /// COMPLETED / CONFIRMED / SETTLED: until the runner leaves the job).
  static const recentlyEndedStatuses = {
    ErrandStatus.completed,
    ErrandStatus.confirmed,
    ErrandStatus.settled,
    ErrandStatus.cancelled,
    ErrandStatus.failed,
  };

  /// How long an ended job stays in [heldJobsPage] (row 129; the API
  /// applies it, from `errands.receiptWindowHours`).
  static const endedJobWindow = Duration(hours: 24);

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

  /// Largest page `GET /runners/me/offers` returns.
  static const maxOffersPageSize = 50;

  /// `GET /runners/me/offers`: open offers, newest first (RA-1). [limit] is
  /// 1–[maxOffersPageSize] (API default 20); pass the previous page's
  /// [RunnerOffersPage.nextCursor] as [cursor]. Offers past
  /// [RunnerJobView.offerEndsAt] are not listed. Returned whatever the
  /// runner's availability: hide them while offline.
  ///
  /// API error: 403 [ApiErrorCodes.runnerNotVerified] (`verification`).
  Future<RunnerOffersPage> offers({int? limit, String? cursor}) async {
    if (limit != null && (limit < 1 || limit > maxOffersPageSize)) {
      throw RangeError.range(limit, 1, maxOffersPageSize, 'limit');
    }
    final data = await _api.getMap(
      '/runners/me/offers',
      query: {'limit': ?limit, 'cursor': ?cursor},
    );
    return RunnerOffersPage.fromJson(data);
  }

  /// `GET /runners/me/jobs/:errandId`: the runner's view of an offered or
  /// held job (RA-2), also after the job ended for the runner who accepted
  /// it (DISPUTED … SETTLED, CANCELLED, FAILED; A2). 403
  /// [ApiErrorCodes.jobNotHeld] when the runner does not hold it: never
  /// offered, declined, offer lapsed or withdrawn, reassigned (row 197).
  /// Prefer [readJob] for a held job, which turns that 403 into
  /// [RunnerJobAccessRevoked].
  Future<RunnerJobView> job(String errandId) =>
      _api.getMap('/runners/me/jobs/$errandId').then(RunnerJobView.fromJson);

  /// [job], with the "not yours" 403 as a result instead of an error
  /// (C-V4): [RunnerJobAvailable] with the view, or [RunnerJobAccessRevoked]
  /// (`v-active`: `This job is no longer assigned to you.`). Other errors
  /// are thrown as by [job].
  Future<RunnerJobRead> readJob(String errandId) async {
    try {
      return RunnerJobAvailable(await job(errandId));
    } on NitumeApiException catch (e) {
      if (isAccessRevoked(e)) return RunnerJobAccessRevoked(errandId);
      rethrow;
    }
  }

  /// True for the 403 the API answers on a job this runner does not hold:
  /// code [ApiErrorCodes.jobNotHeld], or a 403 without a code (older
  /// servers). Other coded 403s (e.g. [ApiErrorCodes.runnerNotVerified],
  /// [ApiErrorCodes.roleMismatch], [ApiErrorCodes.accountSuspended]) are
  /// something else.
  static bool isAccessRevoked(Object error) =>
      error is NitumeApiException &&
      error.statusCode == 403 &&
      (error.code == ApiErrorCodes.jobNotHeld || error.code == null);

  /// Largest page `GET /runners/me/jobs` returns.
  static const maxHeldJobsPageSize = 50;

  /// Most pages [heldJobs] reads (the held set is small: at most one
  /// working job plus the AWAITING_CUSTOMER / DISPUTED and recently ended
  /// ones).
  static const _maxHeldPages = 5;

  /// `GET /runners/me/jobs` (A1): one page of the jobs this runner
  /// **accepted**, newest accept first, as [RunnerJobView]s: the
  /// [activeStatuses] set plus jobs that reached a [recentlyEndedStatuses]
  /// state within the last [endedJobWindow] (server-side). Never open
  /// offers. [limit] is 1–[maxHeldJobsPageSize] (API default 20); pass the
  /// previous page's [RunnerOffersPage.nextCursor] as [cursor] (same page
  /// shape as [offers]).
  Future<RunnerOffersPage> heldJobsPage({int? limit, String? cursor}) async {
    if (limit != null && (limit < 1 || limit > maxHeldJobsPageSize)) {
      throw RangeError.range(limit, 1, maxHeldJobsPageSize, 'limit');
    }
    final data = await _api.getMap(
      '/runners/me/jobs',
      query: {'limit': ?limit, 'cursor': ?cursor},
    );
    return RunnerOffersPage.fromJson(data);
  }

  /// Every held job (C-V3) from [heldJobsPage], the working job (at most
  /// one, in [workingStatuses]) first, then in the API's order (newest
  /// accept first). The screen picks the job to show (`v-active`
  /// selection rule). Defensive: an item whose assignment is not
  /// `accepted` is left out.
  Future<List<RunnerJobView>> heldJobs() async {
    final held = <RunnerJobView>[];
    final seen = <String>{};
    String? cursor;
    for (var page = 0; page < _maxHeldPages; page++) {
      final p = await heldJobsPage(limit: maxHeldJobsPageSize, cursor: cursor);
      for (final j in p.items) {
        if (j.assignment.status == AssignmentStatus.accepted &&
            seen.add(j.id)) {
          held.add(j);
        }
      }
      cursor = p.nextCursor;
      if (cursor == null) break;
    }
    return [
      ...held.where((j) => workingStatuses.contains(j.status)),
      ...held.where((j) => !workingStatuses.contains(j.status)),
    ];
  }

  /// `POST /errands/:id/accept`: RUNNER_ASSIGNED → RUNNER_EN_ROUTE (row
  /// 113); the runner becomes busy. Returns the job and the history row.
  ///
  /// API errors (`NitumeApiException.code`):
  /// - 403 [ApiErrorCodes.runnerNotVerified] (`verificationSummary`); a 403
  ///   without a code when the offer is not this runner's;
  /// - 409 [ApiErrorCodes.offerExpired] (`offerExpiresAt`; past the task
  ///   deadline also `reason` task_deadline_passed and `deadlineAt`, see
  ///   `isTaskDeadlinePassed`);
  /// - 409 [ApiErrorCodes.runnerOffline], [ApiErrorCodes.runnerBusy];
  /// - 409 [ApiErrorCodes.purchaseLimitExceeded] (`requiredPurchase`,
  ///   `maxPurchaseAdvance`);
  /// - 409 [ApiErrorCodes.illegalTransition] (the task left
  ///   RUNNER_ASSIGNED).
  Future<OfferAcceptResult> accept(String errandId) => _api
      .postMap('/errands/$errandId/accept')
      .then(OfferAcceptResult.fromJson);

  /// `POST /errands/:id/decline` `{ reason }` (rows 108, 113, 134, 210,
  /// 229). [reason] is required: one of the four [OfferDeclineReason]
  /// values, picked in the R-23 `DeclineReasonDialog`; the API refuses a
  /// missing reason with 400 [ApiErrorCodes.declineReasonInvalid].
  /// [OfferDeclineReason.overPurchaseLimit] only while
  /// [RunnerJobView.overPurchaseLimit]. The task stays RUNNER_ASSIGNED for
  /// another runner.
  ///
  /// API errors: 400 [ApiErrorCodes.declineReasonInvalid] (`allowed`); 403
  /// not the offered runner; 409 [ApiErrorCodes.offerExpired]; 409
  /// [ApiErrorCodes.assignmentNotDeclinable] (`status`); 409
  /// [ApiErrorCodes.purchaseWithinLimit] (`requiredPurchase`,
  /// `maxPurchaseAdvance`).
  Future<OfferDeclineResult> decline(
    String errandId, {
    required OfferDeclineReason reason,
  }) => _api
      .postMap('/errands/$errandId/decline', data: {'reason': reason.wire})
      .then(OfferDeclineResult.fromJson);

  /// The runner's jobs in [activeStatuses]: `GET /errands?status=…`
  /// (runner-scoped to the current assignment by the API), first page, in
  /// the customer shape. Open offers are not included (RUNNER_ASSIGNED is
  /// not queried). For `v-active` use [heldJobs] (runner projection).
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
  /// [idempotencyKey] (RA-17, the offline queue's action id) goes in the
  /// `Idempotency-Key` header: a replay returns the first result.
  ///
  /// API errors: 409 [ApiErrorCodes.illegalTransition]; 409
  /// [ApiErrorCodes.evidenceRequired] (`missing`); with a key, 400
  /// [ApiErrorCodes.idempotencyKeyInvalid], 409
  /// [ApiErrorCodes.idempotencyKeyReused] and
  /// [ApiErrorCodes.idempotencyInProgress].
  Future<ErrandTransitionResult> transition(
    String errandId, {
    required ErrandStatus from,
    required ErrandStatus to,
    String? note,
    String? idempotencyKey,
  }) async {
    if (!(runnerTransitions[from]?.contains(to) ?? false)) {
      throw ArgumentError('Not a runner transition: ${from.wire} → ${to.wire}');
    }
    if (idempotencyKey == null) {
      return _errands.transition(errandId, to, note: note);
    }
    return ErrandTransitionResult.fromJson(
      await _api.patchMap(
        '/errands/$errandId/status',
        data: {'to': to.wire, 'note': ?note},
        headers: _idempotency(idempotencyKey),
      ),
    );
  }

  static Map<String, String> _idempotency(String key) => {
    'Idempotency-Key': key,
  };

  /// `PATCH /errands/:id/runner-notes` (≤ 2000 characters; `null` clears).
  /// [idempotencyKey]: as [transition].
  Future<Errand> updateRunnerNotes(
    String errandId,
    String? notes, {
    String? idempotencyKey,
  }) async => Errand.fromJson(
    await _api.patchMap(
      '/errands/$errandId/runner-notes',
      data: {'runnerNotes': notes},
      headers: idempotencyKey == null ? null : _idempotency(idempotencyKey),
    ),
  );

  /// `GET /errands/:id/evidence` (signed URLs, row 25).
  Future<List<Evidence>> evidence(String errandId) => _evidence.list(errandId);

  /// `POST /errands/:id/evidence`: one capture as base64 JSON. Photos and
  /// receipts only for runners (video deferred, row 32).
  ///
  /// RA-11: the API's default JSON body limit refuses normal photos until
  /// it is raised or a signed upload is added; expect a 413 meanwhile.
  /// [idempotencyKey]: as [transition] (a replay stores no second row).
  ///
  /// API errors: 400 [ApiErrorCodes.evidenceTypeNotAllowed]; 409
  /// [ApiErrorCodes.evidenceNotAllowed] (`status`, `type`); 409
  /// [ApiErrorCodes.reimbursementWindowClosed] (`endedAt`, `windowEndsAt`).
  Future<Evidence> uploadEvidence(
    String errandId, {
    required EvidenceType type,
    required Uint8List bytes,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
    String? idempotencyKey,
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
          headers: idempotencyKey == null ? null : _idempotency(idempotencyKey),
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

/// [RunnerJobsRepository.readJob] result (C-V4).
sealed class RunnerJobRead {
  const RunnerJobRead();
}

/// The runner can read the job.
final class RunnerJobAvailable extends RunnerJobRead {
  const RunnerJobAvailable(this.job);

  final RunnerJobView job;
}

/// The job is no longer this runner's (reassigned, or never accepted): drop
/// it, stop pings if it was the working job, and show `This job is no
/// longer assigned to you.` (`v-active`).
final class RunnerJobAccessRevoked extends RunnerJobRead {
  const RunnerJobAccessRevoked(this.errandId);

  final String errandId;
}
