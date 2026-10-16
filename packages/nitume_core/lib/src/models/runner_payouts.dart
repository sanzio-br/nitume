import 'json_utils.dart';

/// Status of a runner payout request (`runner_payout_requests.status`, rows
/// 117, 146, 153, 166).
///
/// [cancelled] (row 166) is parsed now even though the API adds it on a
/// separate branch. Unknown values parse as `null`: switch with a wildcard
/// so a new server value never breaks the app.
enum RunnerPayoutRequestStatus {
  /// Open: waiting for ops. Only one at a time (row 117).
  requested('requested'),

  /// Closed by ops with an M-Pesa receipt; `paidAmount` may be below
  /// `requestedAmount` (row 146).
  paid('paid'),

  /// Closed by ops with a runner-visible `decisionNote`.
  rejected('rejected'),

  /// Closed without a payout (row 166). See `cancelledAt` and
  /// `cancellationReason`.
  cancelled('cancelled');

  const RunnerPayoutRequestStatus(this.wire);
  final String wire;

  /// `null` for unknown or absent values.
  static RunnerPayoutRequestStatus? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// One payout request as the runner sees it (`RunnerPayoutRequestView`):
/// `POST /runners/me/payout-requests` and the items of
/// `GET /runners/me/payout-requests`.
///
/// Money fields are decimal strings exactly as the API sends them. Show
/// [requestedAmount] and [paidAmount] separately (row 146); never net them.
class RunnerPayoutRequest {
  const RunnerPayoutRequest({
    required this.id,
    required this.requestedAmount,
    required this.status,
    required this.statusWire,
    required this.destinationPhone,
    this.paidAmount,
    this.createdAt,
    this.decidedAt,
    this.paidAt,
    this.reference,
    this.decisionNote,
    this.cancelledAt,
    this.cancellationReason,
  });

  final String id;

  /// What the runner asked for, e.g. `"2500.00"`.
  final String requestedAmount;

  /// What ops paid; `null` until paid. May be lower than [requestedAmount]
  /// (row 146).
  final String? paidAmount;

  /// `null` when the API sent a status this build does not know (see
  /// [statusWire]).
  final RunnerPayoutRequestStatus? status;

  /// The raw status string.
  final String statusWire;

  /// The runner's sign-in phone, set by the server (row 118).
  final String destinationPhone;
  final DateTime? createdAt;
  final DateTime? decidedAt;
  final DateTime? paidAt;

  /// M-Pesa receipt once paid.
  final String? reference;

  /// Rejection reason shown to the runner; `null` otherwise.
  final String? decisionNote;

  /// When the request was cancelled (row 166); `null` otherwise or until the
  /// API sends it.
  final DateTime? cancelledAt;

  /// Why it was cancelled (row 166); `null` otherwise or until the API sends
  /// it.
  final String? cancellationReason;

  /// True while the request waits for ops.
  bool get isOpen => status == RunnerPayoutRequestStatus.requested;

  factory RunnerPayoutRequest.fromJson(Map<String, dynamic> json) {
    final statusWire = '${json['status'] ?? ''}';
    return RunnerPayoutRequest(
      id: json['id'] as String,
      requestedAmount: parseDecimalOrZero(json['requestedAmount']),
      paidAmount: parseDecimal(json['paidAmount']),
      status: RunnerPayoutRequestStatus.tryFromWire(statusWire),
      statusWire: statusWire,
      destinationPhone: parseOptionalString(json['destinationPhone']) ?? '',
      createdAt: parseDate(json['createdAt']),
      decidedAt: parseDate(json['decidedAt']),
      paidAt: parseDate(json['paidAt']),
      reference: parseOptionalString(json['reference']),
      decisionNote: parseOptionalString(json['decisionNote']),
      cancelledAt: parseDate(json['cancelledAt']),
      cancellationReason: parseOptionalString(json['cancellationReason']),
    );
  }
}

/// The open request inside [PayoutRequestSummary.openRequest].
class OpenPayoutRequest {
  const OpenPayoutRequest({
    required this.id,
    required this.requestedAmount,
    required this.status,
    this.createdAt,
  });

  final String id;
  final String requestedAmount;

  /// `requested` today; `null` for unknown values.
  final RunnerPayoutRequestStatus? status;
  final DateTime? createdAt;

  factory OpenPayoutRequest.fromJson(Map<String, dynamic> json) =>
      OpenPayoutRequest(
        id: json['id'] as String,
        requestedAmount: parseDecimalOrZero(json['requestedAmount']),
        status: RunnerPayoutRequestStatus.tryFromWire(json['status']),
        createdAt: parseDate(json['createdAt']),
      );
}

/// Why an amount cannot be requested, from [PayoutRequestSummary.check].
enum PayoutAmountProblem {
  /// A request is already open (409 `payout_request_open`).
  requestOpen,

  /// Zero, negative, or below [PayoutRequestSummary.minimumAmount]
  /// (`payout_below_minimum`).
  belowMinimum,

  /// Above [PayoutRequestSummary.availableAmount]
  /// (`payout_exceeds_available`).
  exceedsAvailable,
}

/// `GET /runners/me/payout-requests/summary` (`v-payout`, rows 117, 153).
class PayoutRequestSummary {
  const PayoutRequestSummary({
    required this.minimumAmount,
    required this.availableAmount,
    this.openRequest,
  });

  /// Ops-configured minimum (row 117), decimal string.
  final String minimumAmount;

  /// What the runner can request now, decimal string.
  final String availableAmount;

  /// The open request, if any (one at a time).
  final OpenPayoutRequest? openRequest;

  bool get hasOpenRequest => openRequest != null;

  /// Client-side check before `POST /runners/me/payout-requests`, using the
  /// same rules as the API (the API still decides). `null` when [amount]
  /// (KES) can be requested. Compares whole cents.
  PayoutAmountProblem? check(num amount) {
    if (openRequest != null) return PayoutAmountProblem.requestOpen;
    final cents = (amount * 100).round();
    if (cents <= 0 || cents < _cents(minimumAmount)) {
      return PayoutAmountProblem.belowMinimum;
    }
    if (cents > _cents(availableAmount)) {
      return PayoutAmountProblem.exceedsAvailable;
    }
    return null;
  }

  static int _cents(String decimal) =>
      ((double.tryParse(decimal) ?? 0) * 100).round();

  factory PayoutRequestSummary.fromJson(Map<String, dynamic> json) {
    final open = asJsonMapOrNull(json['openRequest']);
    return PayoutRequestSummary(
      minimumAmount: parseDecimalOrZero(json['minimumAmount']),
      availableAmount: parseDecimalOrZero(json['availableAmount']),
      openRequest: open == null ? null : OpenPayoutRequest.fromJson(open),
    );
  }
}

/// A cursor page of [RunnerPayoutRequest]s, newest first.
class PayoutRequestPage {
  const PayoutRequestPage({required this.items, this.nextCursor});

  final List<RunnerPayoutRequest> items;

  /// `null` when there are no more pages.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  factory PayoutRequestPage.fromJson(Map<String, dynamic> json) =>
      PayoutRequestPage(
        items: asJsonList(json['items'])
            .map(RunnerPayoutRequest.fromJson)
            .toList(),
        nextCursor: parseOptionalString(json['nextCursor']),
      );
}

/// Kind of a payout feed entry (`GET /runners/me/payout-lines`, row 107).
/// Unknown values parse as `null`.
enum PayoutFeedKind {
  runnerFee('runner_fee'),
  itemReimbursement('item_reimbursement'),

  /// Derived: one M-Pesa payout covering [PayoutFeedItem.lineIds].
  payout('payout'),
  correction('correction'),
  reversal('reversal'),
  resentPayout('resent_payout');

  const PayoutFeedKind(this.wire);
  final String wire;

  static PayoutFeedKind? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// Effective status of a payout feed entry. Job lines: on hold, payable,
/// paid or rejected (a reversed payout makes the line payable again).
/// `payout` / `resent_payout`: paid. `correction` / `reversal`: recorded.
/// Unknown values parse as `null`.
enum PayoutLineStatus {
  onHold('on_hold'),
  payable('payable'),
  paid('paid'),
  rejected('rejected'),
  recorded('recorded');

  const PayoutLineStatus(this.wire);
  final String wire;

  static PayoutLineStatus? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// Why a job line is on hold (rows 105, 106, 135). Unknown values parse as
/// `null`.
enum PayoutReviewReason {
  receiptMissing('receipt_missing'),
  receiptMismatch('receipt_mismatch'),
  outOfPocketClaim('out_of_pocket_claim'),
  overPurchaseLimit('over_purchase_limit');

  const PayoutReviewReason(this.wire);
  final String wire;

  static PayoutReviewReason? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// One entry of the runner's payout feed, `GET /runners/me/payout-lines`
/// (`PayoutFeedItem`, RA-14, RA-16, row 107). Each entry is its own row;
/// nothing is merged or netted.
///
/// [amount] is a signed decimal string: positive = owed to the runner,
/// negative = paid out (`"1750.00"`, `"-6000.00"`); format it with
/// `formatKesLedger`.
class PayoutFeedItem {
  const PayoutFeedItem({
    required this.id,
    required this.kind,
    required this.kindWire,
    required this.status,
    required this.amount,
    this.errandId,
    this.errandTitle,
    this.errandReference,
    this.reference,
    this.relatedLineId,
    this.lineIds = const [],
    this.reviewReason,
    this.createdAt,
    this.payableAt,
    this.paidAt,
    this.payoutRequestId,
    this.requestedAmount,
  });

  /// Line id, or an opaque `payout:<line id>` for a derived payout entry.
  final String id;

  /// `null` for kinds this build does not know (see [kindWire]).
  final PayoutFeedKind? kind;
  final String kindWire;

  /// `null` for statuses this build does not know.
  final PayoutLineStatus? status;

  /// Signed KES decimal string.
  final String amount;

  /// `null` on a payout covering several tasks.
  final String? errandId;
  final String? errandTitle;
  final String? errandReference;

  /// M-Pesa receipt (payout, re-sent payout, correction, reversal code);
  /// `null` on job lines.
  final String? reference;

  /// Adjustments: the job line they change.
  final String? relatedLineId;

  /// `payout` entries: the job lines the M-Pesa payout covered.
  final List<String> lineIds;

  /// Job lines on hold: why; `null` otherwise or for unknown reasons.
  final PayoutReviewReason? reviewReason;
  final DateTime? createdAt;

  /// Job lines: when the line became payable.
  final DateTime? payableAt;

  /// `payout` / `resent_payout`: when it was sent. Job lines: their
  /// original payout time.
  final DateTime? paidAt;

  /// `payout` entries and job lines paid on a payout request (rows 117,
  /// 153): the request id; `null` otherwise.
  final String? payoutRequestId;

  /// `payout` entries paid on a request: the amount the runner asked for
  /// (decimal string). Show it beside [amount], never instead of it (row
  /// 146). `null` otherwise.
  final String? requestedAmount;

  factory PayoutFeedItem.fromJson(Map<String, dynamic> json) {
    final kindWire = '${json['kind'] ?? ''}';
    final lineIds = json['lineIds'];
    return PayoutFeedItem(
      id: json['id'] as String,
      kind: PayoutFeedKind.tryFromWire(kindWire),
      kindWire: kindWire,
      status: PayoutLineStatus.tryFromWire(json['status']),
      amount: parseDecimalOrZero(json['amount']),
      errandId: parseOptionalString(json['errandId']),
      errandTitle: parseOptionalString(json['errandTitle']),
      errandReference: parseOptionalString(json['errandReference']),
      reference: parseOptionalString(json['reference']),
      relatedLineId: parseOptionalString(json['relatedLineId']),
      lineIds: lineIds is List ? [for (final l in lineIds) '$l'] : const [],
      reviewReason: PayoutReviewReason.tryFromWire(json['reviewReason']),
      createdAt: parseDate(json['createdAt']),
      payableAt: parseDate(json['payableAt']),
      paidAt: parseDate(json['paidAt']),
      payoutRequestId: parseOptionalString(json['payoutRequestId']),
      requestedAmount: parseDecimal(json['requestedAmount']),
    );
  }
}

/// A cursor page of [PayoutFeedItem]s, newest first.
class PayoutFeedPage {
  const PayoutFeedPage({required this.items, this.nextCursor});

  final List<PayoutFeedItem> items;

  /// `null` when there are no more pages.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  factory PayoutFeedPage.fromJson(Map<String, dynamic> json) => PayoutFeedPage(
    items: asJsonList(json['items']).map(PayoutFeedItem.fromJson).toList(),
    nextCursor: parseOptionalString(json['nextCursor']),
  );
}
