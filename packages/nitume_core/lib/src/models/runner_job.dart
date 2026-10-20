import 'enums.dart';
import 'errand.dart';
import 'errand_details.dart';
import 'errand_location.dart';
import 'json_utils.dart';

/// Why a runner declines an offer (`POST /errands/:id/decline`, rows 108,
/// 113, 210). Wire values are the API enum, lowercase snake_case. Declining
/// without a reason is a general decline (the API keeps the reason
/// optional). Screen labels live in `DeclineReasonCopy`.
enum OfferDeclineReason {
  /// The task's required purchase is above the runner's purchase limit.
  /// Only accepted while [RunnerJobView.overPurchaseLimit] (409
  /// `purchase_within_limit` otherwise).
  overPurchaseLimit('over_purchase_limit'),

  /// The task is too far away (row 210).
  tooFar('too_far'),

  /// The runner is not available right now (row 210).
  notAvailable('not_available'),

  /// Any other reason; no free text is stored (row 210).
  other('other');

  const OfferDeclineReason(this.wire);
  final String wire;

  /// Tolerant parse (trims, ignores case); `null` for an absent or unknown
  /// value.
  static OfferDeclineReason? tryFromWire(Object? v) {
    if (v is! String) return null;
    final s = v.trim().toLowerCase();
    for (final e in values) {
      if (e.wire == s) return e;
    }
    return null;
  }
}

/// Row 248 (owner, 2026-10-20): an approved price increase on a
/// `send_to_runner` job whose difference the customer has not paid yet
/// ([RunnerJobView.differenceAwaitingPayment]).
///
/// While it is set, [RunnerJobView.itemAmount] is already the new price but
/// the runner buys only up to [RunnerJobView.requiredPurchase] (the old
/// amount). Show `RunnerPriceChangeCopy.differenceAwaitingPayment`. It clears on
/// `price_change:difference_paid` (`PriceDifferencePaid`): reload the job.
class DifferenceAwaitingPayment {
  const DifferenceAwaitingPayment({
    required this.amount,
    this.priceChangeRequestIds = const [],
  });

  /// The unpaid difference in total, a 2-decimal KES string (Fira Code).
  final String amount;

  /// The approved price-change requests still waiting for payment.
  final List<String> priceChangeRequestIds;

  /// `null` for an absent or unreadable value (treated as nothing waiting).
  static DifferenceAwaitingPayment? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final amount = parseDecimal(json['amount']);
    if (amount == null) return null;
    final ids = json['priceChangeRequestIds'];
    return DifferenceAwaitingPayment(
      amount: amount,
      priceChangeRequestIds: ids is List
          ? [
              for (final e in ids)
                if (e is String && e.isNotEmpty) e,
            ]
          : const [],
    );
  }
}

/// The runner's own assignment on a [RunnerJobView] (RA-1).
class RunnerJobAssignment {
  const RunnerJobAssignment({
    required this.id,
    required this.status,
    this.offeredAt,
    this.offerExpiresAt,
    this.decidedAt,
  });

  final String id;

  /// `assigned` = open offer, `accepted` once accepted; `null` for a value
  /// this build does not know.
  final AssignmentStatus? status;
  final DateTime? offeredAt;

  /// Acceptance deadline; `null` on offers made before deadlines existed
  /// (row 156: they never lapse). Kept for the record once accepted.
  final DateTime? offerExpiresAt;

  /// When the runner accepted; `null` while the offer is open.
  final DateTime? decidedAt;

  factory RunnerJobAssignment.fromJson(Map<String, dynamic> json) =>
      RunnerJobAssignment(
        id: json['id'] as String,
        status: AssignmentStatus.tryFromWire(json['status']),
        offeredAt: parseDate(json['offeredAt']),
        offerExpiresAt: parseDate(json['offerExpiresAt']),
        decidedAt: parseDate(json['decidedAt']),
      );
}

/// RA-2: a job as the runner sees it (open offer or held job):
/// `GET /runners/me/offers` items, `GET /runners/me/jobs/:errandId` and the
/// accept reply.
///
/// Three-flow separation: the runner reads only [runnerFee] and the item
/// amount. There is no service fee, customer fee total, quoted price or
/// customer contact on this model. Money is a 2-decimal KES string.
class RunnerJobView {
  const RunnerJobView({
    required this.id,
    required this.reference,
    required this.status,
    required this.category,
    required this.description,
    required this.urgency,
    required this.runnerFee,
    required this.requiredPurchase,
    required this.maxPurchaseAdvance,
    required this.overPurchaseLimit,
    required this.assignment,
    this.title,
    this.deadlineAt,
    this.createdAt,
    this.locations = const [],
    this.firstPoint,
    this.items = const [],
    this.runnerNotes,
    this.itemAmount,
    this.merchantRoute,
    this.offerExpiresAt,
    this.differenceAwaitingPayment,
  });

  /// Errand id.
  final String id;
  final String reference;
  final ErrandStatus status;
  final ErrandCategory category;
  final String? title;
  final String description;
  final ErrandUrgency urgency;

  /// The customer's task deadline; `null` without one. Past it the task can
  /// no longer be accepted (row 185).
  final DateTime? deadlineAt;
  final DateTime? createdAt;
  final List<ErrandLocation> locations;

  /// First task point for the offer card: task site, else pickup, else
  /// drop-off (chosen by the API).
  final ErrandLocation? firstPoint;
  final List<ErrandItem> items;
  final String? runnerNotes;

  /// The runner fee the customer paid.
  final String runnerFee;

  /// Current item / merchant amount after approved price changes; `null`
  /// without one.
  final String? itemAmount;

  /// How the item is paid; `null` without an item amount.
  final MerchantRoute? merchantRoute;

  /// What the runner pays out of pocket and is reimbursed for
  /// (`send_to_runner`); `"0.00"` otherwise. It is also the most the runner
  /// may spend on the item: while [differenceAwaitingPayment] is set it
  /// stays at the old amount although [itemAmount] is the new price (row
  /// 248).
  final String requiredPurchase;

  /// Row 248: set while an approved increase waits for the customer to pay
  /// the difference (`send_to_runner` only); `null` otherwise, and on APIs
  /// that do not send it.
  final DifferenceAwaitingPayment? differenceAwaitingPayment;

  /// True while [differenceAwaitingPayment] is set: buy only up to
  /// [requiredPurchase].
  bool get isAwaitingDifference => differenceAwaitingPayment != null;

  /// The runner's purchase limit (row 138).
  final String maxPurchaseAdvance;

  /// [requiredPurchase] is above [maxPurchaseAdvance]: accepting is refused
  /// (409 `purchase_limit_exceeded`); declining with
  /// [OfferDeclineReason.overPurchaseLimit] is allowed (rows 108, 113).
  final bool overPurchaseLimit;

  /// The offer's acceptance deadline while the offer is open, else `null`.
  final DateTime? offerExpiresAt;
  final RunnerJobAssignment assignment;

  /// True while the runner can still accept or decline (task
  /// RUNNER_ASSIGNED, assignment open).
  bool get isOpenOffer =>
      status == ErrandStatus.runnerAssigned &&
      (assignment.status?.isOpenOffer ?? false);

  /// When an open offer stops being acceptable: the earlier of
  /// [offerExpiresAt] and [deadlineAt]. `null` when neither is set (the
  /// offer never lapses, row 156: show no countdown) or when this is not an
  /// open offer.
  DateTime? get offerEndsAt {
    if (!isOpenOffer) return null;
    final a = offerExpiresAt;
    final b = deadlineAt;
    if (a == null) return b;
    if (b == null) return a;
    return b.isBefore(a) ? b : a;
  }

  /// True when an open offer's [offerEndsAt] has passed at [now] (remove the
  /// offer card). Always false without an end time.
  bool offerEndedAt(DateTime now) {
    final end = offerEndsAt;
    return end != null && !now.isBefore(end);
  }

  /// Time left until [offerEndsAt] at [now], never negative; `null` without
  /// an end time (no countdown).
  Duration? offerTimeLeftAt(DateTime now) {
    final end = offerEndsAt;
    if (end == null) return null;
    final left = end.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  factory RunnerJobView.fromJson(Map<String, dynamic> json) {
    final first = json['firstPoint'];
    return RunnerJobView(
      id: json['id'] as String,
      reference: '${json['reference'] ?? ''}',
      status: ErrandStatus.fromWire(json['status'] as String),
      category: ErrandCategory.fromWire(json['category'] as String),
      title: parseOptionalString(json['title']),
      description: '${json['description'] ?? ''}',
      urgency: ErrandUrgency.fromWire(json['urgency'] as String),
      deadlineAt: parseDate(json['deadlineAt']),
      createdAt: parseDate(json['createdAt']),
      locations: _tolerant(json['locations'], ErrandLocation.fromJson),
      firstPoint: first is Map
          ? _tryParse(first.cast<String, dynamic>(), ErrandLocation.fromJson)
          : null,
      items: _tolerant(json['items'], ErrandItem.fromJson),
      runnerNotes: parseOptionalString(json['runnerNotes']),
      runnerFee: parseDecimalOrZero(json['runnerFee']),
      itemAmount: parseDecimal(json['itemAmount']),
      merchantRoute: MerchantRoute.tryFromWire(json['merchantRoute']),
      requiredPurchase: parseDecimalOrZero(json['requiredPurchase']),
      maxPurchaseAdvance: parseDecimalOrZero(json['maxPurchaseAdvance']),
      overPurchaseLimit: json['overPurchaseLimit'] == true,
      offerExpiresAt: parseDate(json['offerExpiresAt']),
      differenceAwaitingPayment: DifferenceAwaitingPayment.tryFromJson(
        json['differenceAwaitingPayment'],
      ),
      assignment: RunnerJobAssignment.fromJson(asJsonMap(json['assignment'])),
    );
  }
}

/// One page of `GET /runners/me/offers`, newest first. Pass [nextCursor]
/// back to read the next page.
class RunnerOffersPage {
  const RunnerOffersPage({required this.items, this.nextCursor});

  /// Offers this build can read; entries that fail to parse are skipped.
  final List<RunnerJobView> items;
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  factory RunnerOffersPage.fromJson(Map<String, dynamic> json) =>
      RunnerOffersPage(
        items: _tolerant(json['items'], RunnerJobView.fromJson),
        nextCursor: parseOptionalString(json['nextCursor']),
      );
}

/// `POST /errands/:id/accept` reply: the job after RUNNER_ASSIGNED →
/// RUNNER_EN_ROUTE and the history row written.
class OfferAcceptResult {
  const OfferAcceptResult({required this.job, required this.history});

  final RunnerJobView job;
  final StatusHistoryEntry history;

  factory OfferAcceptResult.fromJson(Map<String, dynamic> json) =>
      OfferAcceptResult(
        job: RunnerJobView.fromJson(asJsonMap(json['job'])),
        history: StatusHistoryEntry.fromJson(asJsonMap(json['history'])),
      );
}

/// `POST /errands/:id/decline` reply. The task stays RUNNER_ASSIGNED for
/// another runner; this runner is not offered it again (row 178).
class OfferDeclineResult {
  const OfferDeclineResult({
    required this.errandId,
    required this.assignmentId,
    required this.requiredPurchase,
    required this.maxPurchaseAdvance,
    required this.overLimit,
    this.runnerProfileId,
    this.status,
    this.declineReason,
  });

  final String errandId;
  final String? runnerProfileId;
  final String assignmentId;

  /// `declined`.
  final AssignmentStatus? status;

  /// `null` for a general decline.
  final OfferDeclineReason? declineReason;
  final String requiredPurchase;
  final String maxPurchaseAdvance;
  final bool overLimit;

  factory OfferDeclineResult.fromJson(Map<String, dynamic> json) =>
      OfferDeclineResult(
        errandId: json['errandId'] as String,
        runnerProfileId: parseOptionalString(json['runnerProfileId']),
        assignmentId: json['assignmentId'] as String,
        status: AssignmentStatus.tryFromWire(json['status']),
        declineReason: OfferDeclineReason.tryFromWire(json['declineReason']),
        requiredPurchase: parseDecimalOrZero(json['requiredPurchase']),
        maxPurchaseAdvance: parseDecimalOrZero(json['maxPurchaseAdvance']),
        overLimit: json['overLimit'] == true,
      );
}

T? _tryParse<T>(Map<String, dynamic> json, T Function(Map<String, dynamic>) f) {
  try {
    return f(json);
  } on Object {
    return null;
  }
}

List<T> _tolerant<T>(Object? value, T Function(Map<String, dynamic>) f) {
  if (value is! List) return const [];
  return [
    for (final e in value)
      if (e is Map) ?_tryParse(e.cast<String, dynamic>(), f),
  ];
}
