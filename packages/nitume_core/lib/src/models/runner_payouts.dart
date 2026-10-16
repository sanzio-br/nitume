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

  /// Closed by ops without a payout (row 166). The runner cannot cancel; the
  /// screen offers no cancel action. The ops reason is never sent to the
  /// runner: show generic text such as `Payout request cancelled` (row 168).
  /// See `cancelledAt`.
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
  /// API sends it. There is deliberately no cancellation reason: the runner
  /// never sees the ops reason and the screen shows generic text (row 168).
  final DateTime? cancelledAt;

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
  /// Not a KES amount with at most two decimals.
  invalid,

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
  /// same rules as the API (the API still decides). [amount] is the KES
  /// amount as a decimal string (the field text, e.g. `"2500"` or
  /// `"2500.50"`). `null` when it can be requested. Compares whole cents
  /// read straight from the strings, so no money passes through a double.
  PayoutAmountProblem? check(String amount) {
    if (openRequest != null) return PayoutAmountProblem.requestOpen;
    final cents = parseCents(amount);
    if (cents == null) return PayoutAmountProblem.invalid;
    if (cents <= 0 || cents < (parseCents(minimumAmount) ?? 0)) {
      return PayoutAmountProblem.belowMinimum;
    }
    if (cents > (parseCents(availableAmount) ?? 0)) {
      return PayoutAmountProblem.exceedsAvailable;
    }
    return null;
  }

  static final _decimal = RegExp(r'^(-?)(\d+)(?:\.(\d{1,2}))?$');

  /// Whole cents of a KES decimal string (`"2500.5"` → 250050), split on
  /// the `.` without floating point. Surrounding spaces and `,` thousands
  /// separators are ignored. `null` when it is not a number with at most
  /// two decimals.
  static int? parseCents(String decimal) {
    final m = _decimal.firstMatch(decimal.trim().replaceAll(',', ''));
    if (m == null) return null;
    final whole = int.parse(m.group(2)!);
    final fraction = int.parse((m.group(3) ?? '').padRight(2, '0'));
    final cents = whole * 100 + fraction;
    return m.group(1) == '-' ? -cents : cents;
  }

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

/// Grouping of [EarningsPeriod.buckets] (`groupBy`).
enum EarningsGroupBy {
  day('day'),
  week('week'),
  month('month');

  const EarningsGroupBy(this.wire);
  final String wire;

  /// `null` for unknown or absent values.
  static EarningsGroupBy? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// Balance figures of one kind of ledger line (decimal strings).
class EarningsKindTotals {
  const EarningsKindTotals({
    required this.availableAmount,
    required this.onHoldAmount,
    required this.paidAmount,
  });

  final String availableAmount;
  final String onHoldAmount;
  final String paidAmount;

  factory EarningsKindTotals.fromJson(Object? json) {
    final m = json is Map ? asJsonMap(json) : const <String, dynamic>{};
    return EarningsKindTotals(
      availableAmount: parseDecimalOrZero(m['availableAmount']),
      onHoldAmount: parseDecimalOrZero(m['onHoldAmount']),
      paidAmount: parseDecimalOrZero(m['paidAmount']),
    );
  }
}

/// One day of the current EAT week (Monday first) for the weekly chart.
class EarningsWeekDay {
  const EarningsWeekDay({required this.day, required this.runnerFeeAmount});

  /// `YYYY-MM-DD`, an East Africa Time calendar day (row 122).
  final String day;

  /// Runner fees earned that day, decimal string (the bar height, R-11).
  final String runnerFeeAmount;

  factory EarningsWeekDay.fromJson(Map<String, dynamic> json) =>
      EarningsWeekDay(
        day: '${json['day'] ?? ''}',
        runnerFeeAmount: parseDecimalOrZero(json['runnerFeeAmount']),
      );
}

/// One bucket (or the totals) of [EarningsPeriod]. Item reimbursements are
/// not income: show them apart from runner fees.
class EarningsBucket {
  const EarningsBucket({
    this.start,
    required this.runnerFeeAmount,
    required this.itemReimbursementAmount,
    required this.paidOutAmount,
  });

  /// First day of the bucket, `YYYY-MM-DD` in EAT; `null` on the totals.
  final String? start;
  final String runnerFeeAmount;
  final String itemReimbursementAmount;
  final String paidOutAmount;

  factory EarningsBucket.fromJson(Object? json) {
    final m = json is Map ? asJsonMap(json) : const <String, dynamic>{};
    return EarningsBucket(
      start: parseOptionalString(m['start']),
      runnerFeeAmount: parseDecimalOrZero(m['runnerFeeAmount']),
      itemReimbursementAmount: parseDecimalOrZero(m['itemReimbursementAmount']),
      paidOutAmount: parseDecimalOrZero(m['paidOutAmount']),
    );
  }
}

/// The breakdown for the requested range of `GET /runners/me/earnings`.
class EarningsPeriod {
  const EarningsPeriod({
    required this.from,
    required this.to,
    required this.groupBy,
    required this.totals,
    required this.buckets,
  });

  /// `YYYY-MM-DD` in EAT, both included.
  final String from;
  final String to;

  /// `null` for an unknown value.
  final EarningsGroupBy? groupBy;
  final EarningsBucket totals;
  final List<EarningsBucket> buckets;

  factory EarningsPeriod.fromJson(Object? json) {
    final m = json is Map ? asJsonMap(json) : const <String, dynamic>{};
    return EarningsPeriod(
      from: '${m['from'] ?? ''}',
      to: '${m['to'] ?? ''}',
      groupBy: EarningsGroupBy.tryFromWire(m['groupBy']),
      totals: EarningsBucket.fromJson(m['totals']),
      buckets: [
        for (final b in (m['buckets'] as List? ?? const []))
          EarningsBucket.fromJson(b),
      ],
    );
  }
}

/// `GET /runners/me/earnings` (`v-earnings`, RA-14): derived from the
/// payout ledger, nothing stored (row 107, OA-6). [availableAmount] is the
/// "Available balance": a ledger view, never a wallet. Decimal strings.
class EarningsSummary {
  const EarningsSummary({
    required this.availableAmount,
    required this.pendingAmount,
    required this.onHoldAmount,
    required this.paidAmount,
    required this.runnerFee,
    required this.itemReimbursement,
    required this.week,
    required this.weekTotal,
    required this.period,
  });

  /// Payable lines plus reversed payouts not yet re-sent.
  final String availableAmount;

  /// Runner fee + item amount of tasks waiting for confirmation (not on the
  /// ledger yet), e.g. `KSh 1,200 waiting for confirmation` on R-08.
  final String pendingAmount;

  /// Item reimbursements on hold for ops review (requested amounts).
  final String onHoldAmount;

  /// Effective total paid out.
  final String paidAmount;

  /// `byKind.runnerFee`.
  final EarningsKindTotals runnerFee;

  /// `byKind.itemReimbursement`.
  final EarningsKindTotals itemReimbursement;

  /// Current EAT week, Monday to Sunday (7 entries from the API).
  final List<EarningsWeekDay> week;

  /// Runner fees this week.
  final String weekTotal;
  final EarningsPeriod period;

  factory EarningsSummary.fromJson(Map<String, dynamic> json) {
    final byKind = json['byKind'] is Map
        ? asJsonMap(json['byKind'])
        : const <String, dynamic>{};
    return EarningsSummary(
      availableAmount: parseDecimalOrZero(json['availableAmount']),
      pendingAmount: parseDecimalOrZero(json['pendingAmount']),
      onHoldAmount: parseDecimalOrZero(json['onHoldAmount']),
      paidAmount: parseDecimalOrZero(json['paidAmount']),
      runnerFee: EarningsKindTotals.fromJson(byKind['runnerFee']),
      itemReimbursement: EarningsKindTotals.fromJson(
        byKind['itemReimbursement'],
      ),
      week: asJsonList(json['week']).map(EarningsWeekDay.fromJson).toList(),
      weekTotal: parseDecimalOrZero(json['weekTotal']),
      period: EarningsPeriod.fromJson(json['period']),
    );
  }

  /// `YYYY-MM-DD` of [instant] in East Africa Time (UTC+3 all year), the
  /// day format of `from` / `to`.
  static String eatDay(DateTime instant) {
    final eat = instant.toUtc().add(const Duration(hours: 3));
    String two(int v) => v.toString().padLeft(2, '0');
    return '${eat.year.toString().padLeft(4, '0')}-${two(eat.month)}-'
        '${two(eat.day)}';
  }
}
