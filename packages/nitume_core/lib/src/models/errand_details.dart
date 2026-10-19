import '../api/api_exception.dart' show ApiErrorCodes;
import 'enums.dart';
import 'errand.dart';
import 'errand_location.dart';
import 'json_utils.dart';
import 'runner.dart';

/// One row of `GET /errands/:id/history` (`errand_status_history`,
/// append-only, oldest first).
class StatusHistoryEntry {
  const StatusHistoryEntry({
    required this.id,
    required this.errandId,
    required this.toStatus,
    required this.actorType,
    this.fromStatus,
    this.actorId,
    this.note,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final ErrandStatus? fromStatus;
  final ErrandStatus toStatus;
  final StatusHistoryActor actorType;
  final String? actorId;
  final String? note;
  final DateTime? createdAt;

  factory StatusHistoryEntry.fromJson(Map<String, dynamic> json) =>
      StatusHistoryEntry(
        id: json['id'] as String,
        errandId: json['errandId'] as String,
        fromStatus: json['fromStatus'] == null
            ? null
            : ErrandStatus.fromWire(json['fromStatus'] as String),
        toStatus: ErrandStatus.fromWire(json['toStatus'] as String),
        actorType: StatusHistoryActor.fromWire(json['actorType'] as String),
        actorId: json['actorId'] as String?,
        note: json['note'] as String?,
        createdAt: parseDate(json['createdAt']),
      );
}

/// Result of a create / submit / transition call: the errand plus the history
/// row the transition wrote (`ErrandResult`).
class ErrandTransitionResult {
  const ErrandTransitionResult({required this.errand, required this.history});

  final Errand errand;
  final StatusHistoryEntry history;

  factory ErrandTransitionResult.fromJson(Map<String, dynamic> json) =>
      ErrandTransitionResult(
        errand: Errand.fromJson(asJsonMap(json['errand'])),
        history: StatusHistoryEntry.fromJson(asJsonMap(json['history'])),
      );
}

/// A cursor page of errands (`GET /errands`).
class ErrandPage {
  const ErrandPage({required this.items, this.nextCursor});

  final List<Errand> items;

  /// `null` when there are no more pages.
  final String? nextCursor;

  bool get hasMore => nextCursor != null;

  factory ErrandPage.fromJson(Map<String, dynamic> json) => ErrandPage(
    items: asJsonList(json['items']).map(Errand.fromJson).toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// Shopping-list item for `POST /errands` (`ErrandItemDto`).
class ErrandItemInput {
  const ErrandItemInput({
    required this.name,
    this.quantity,
    this.unit,
    this.notes,
  });

  final String name;
  final int? quantity;
  final String? unit;
  final String? notes;

  Map<String, dynamic> toJson() => {
    'name': name,
    if (quantity != null) 'quantity': quantity,
    if (unit != null) 'unit': unit,
    if (notes != null) 'notes': notes,
  };
}

/// Body of `POST /errands` (`CreateErrandDto`). The errand is created as
/// DRAFT; call `ErrandRepository.submit` to move it to REQUESTED.
///
/// [title] is the optional customer title (Q15). `reference` is
/// backend-generated and never sent.
class CreateErrandRequest {
  const CreateErrandRequest({
    required this.category,
    required this.description,
    required this.budget,
    required this.locations,
    this.deadlineAt,
    this.urgency,
    this.items = const [],
    this.title,
  });

  final ErrandCategory category;

  /// Optional task title, 3–120 characters after trimming. Sent trimmed;
  /// omitted when `null` or blank. Shorter titles fail validation on the
  /// API (400).
  final String? title;

  /// 5–4000 characters.
  final String description;

  /// Whole or 2-decimal amount in KES (0 – 1,000,000).
  final num budget;

  /// 1–10 points.
  final List<ErrandLocation> locations;
  final DateTime? deadlineAt;
  final ErrandUrgency? urgency;
  final List<ErrandItemInput> items;

  Map<String, dynamic> toJson() => {
    'category': category.wire,
    if (title?.trim() case final t? when t.isNotEmpty) 'title': t,
    'description': description,
    'budget': budget,
    'locations': [for (final l in locations) l.toJson()],
    if (deadlineAt != null) 'deadlineAt': deadlineAt!.toUtc().toIso8601String(),
    if (urgency != null) 'urgency': urgency!.wire,
    if (items.isNotEmpty) 'items': [for (final i in items) i.toJson()],
  };
}

/// Partial body of `PATCH /errands/:id` (`{ title?, deadlineAt? }`): only
/// the fields set with [withTitle] / [withDeadline] are sent, so "leave it"
/// and "clear it" (`null`) stay distinct.
///
/// - Title: `null` clears it; 3–120 characters after trimming.
/// - Deadline (row 237): customer only (403
///   [ApiErrorCodes.deadlineCustomerOnly]); only before payment, DRAFT to
///   ACCEPTED (409 [ApiErrorCodes.deadlineNotEditable], `status`); a time in
///   the future (400 [ApiErrorCodes.deadlineInPast]); `null` switches the
///   task back to `Flexible`, its clock starting at payment (row 244). The
///   quote is kept (row 242).
///
/// ```dart
/// repo.update(id, const ErrandUpdate().withDeadline(null)); // Flexible
/// ```
final class ErrandUpdate {
  const ErrandUpdate()
    : _title = null,
      _deadlineAt = null,
      _hasTitle = false,
      _hasDeadline = false;

  const ErrandUpdate._(
    this._title,
    this._deadlineAt,
    this._hasTitle,
    this._hasDeadline,
  );

  final String? _title;
  final DateTime? _deadlineAt;
  final bool _hasTitle;
  final bool _hasDeadline;

  /// Sets ([title] non-null) or clears (`null`) the title.
  ErrandUpdate withTitle(String? title) =>
      ErrandUpdate._(title, _deadlineAt, true, _hasDeadline);

  /// Sets a new deadline, or `null` for `Flexible` (row 244).
  ErrandUpdate withDeadline(DateTime? deadlineAt) =>
      ErrandUpdate._(_title, deadlineAt, _hasTitle, true);

  /// True when nothing would change.
  bool get isEmpty => !_hasTitle && !_hasDeadline;

  /// True when the deadline is part of the update.
  bool get changesDeadline => _hasDeadline;

  Map<String, dynamic> toJson() => {
    if (_hasTitle) 'title': _title,
    if (_hasDeadline) 'deadlineAt': _deadlineAt?.toUtc().toIso8601String(),
  };
}

/// Customer-readable quote breakdown, `GET /errands/:id/quote`. Amounts are
/// decimal strings.
class Quote {
  const Quote({
    required this.id,
    required this.errandId,
    required this.baseFee,
    required this.distanceFee,
    required this.timeFee,
    required this.urgencyFee,
    required this.complexityFee,
    required this.premiumFee,
    required this.total,
    required this.currency,
    this.expiresAt,
    this.createdAt,
  });

  final String id;
  final String errandId;
  final String baseFee;
  final String distanceFee;
  final String timeFee;
  final String urgencyFee;
  final String complexityFee;
  final String premiumFee;
  final String total;
  final String currency;
  final DateTime? expiresAt;
  final DateTime? createdAt;

  factory Quote.fromJson(Map<String, dynamic> json) => Quote(
    id: json['id'] as String,
    errandId: json['errandId'] as String,
    baseFee: parseDecimalOrZero(json['baseFee']),
    distanceFee: parseDecimalOrZero(json['distanceFee']),
    timeFee: parseDecimalOrZero(json['timeFee']),
    urgencyFee: parseDecimalOrZero(json['urgencyFee']),
    complexityFee: parseDecimalOrZero(json['complexityFee']),
    premiumFee: parseDecimalOrZero(json['premiumFee']),
    total: parseDecimalOrZero(json['total']),
    currency: json['currency'] as String? ?? 'KES',
    expiresAt: parseDate(json['expiresAt']),
    createdAt: parseDate(json['createdAt']),
  );
}

/// Last-known runner position in a [TrackingSnapshot].
class RunnerLocation {
  const RunnerLocation({required this.point, this.capturedAt});

  final GeoPoint point;
  final DateTime? capturedAt;

  factory RunnerLocation.fromJson(Map<String, dynamic> json) => RunnerLocation(
    point: GeoPoint(
      lat: parseDouble(json['lat']) ?? 0,
      lng: parseDouble(json['lng']) ?? 0,
    ),
    capturedAt: parseDate(json['capturedAt']),
  );
}

/// Initial tracking state, `GET /errands/:id/tracking`. Live updates then
/// arrive over the realtime `location:update` event.
class TrackingSnapshot {
  const TrackingSnapshot({
    required this.errandId,
    required this.status,
    required this.live,
    required this.points,
    this.runner,
    this.runnerLocation,
    this.eta,
  });

  final String errandId;
  final ErrandStatus status;

  /// True while the runner position is shared.
  final bool live;
  final List<ErrandLocation> points;
  final RunnerSummary? runner;
  final RunnerLocation? runnerLocation;

  /// Time to arrival; currently always `null` from the API (ETA not wired).
  final Duration? eta;

  factory TrackingSnapshot.fromJson(Map<String, dynamic> json) {
    final etaSeconds = json['eta'] as num?;
    return TrackingSnapshot(
      errandId: json['errandId'] as String,
      status: ErrandStatus.fromWire(json['status'] as String),
      live: json['live'] as bool? ?? false,
      points: asJsonList(json['points']).map(ErrandLocation.fromJson).toList(),
      runner: json['runner'] == null
          ? null
          : RunnerSummary.fromJson(asJsonMap(json['runner'])),
      runnerLocation: json['runnerLocation'] == null
          ? null
          : RunnerLocation.fromJson(asJsonMap(json['runnerLocation'])),
      eta: etaSeconds == null ? null : Duration(seconds: etaSeconds.round()),
    );
  }
}

/// Result of `ErrandRepository.acceptQuote` (`{errand, quote}`).
class QuoteAcceptanceResult {
  const QuoteAcceptanceResult({required this.errand, this.quote});

  /// The errand after acceptance (ACCEPTED, `quoteAcceptanceRequired`
  /// false).
  final Errand errand;

  /// The accepted quote; `null` when the response had none (or the
  /// transition fallback ran).
  final Quote? quote;

  factory QuoteAcceptanceResult.fromJson(Map<String, dynamic> json) {
    Quote? quote;
    final q = json['quote'];
    if (q is Map) {
      try {
        quote = Quote.fromJson(q.cast<String, dynamic>());
      } on Object {
        quote = null;
      }
    }
    return QuoteAcceptanceResult(
      errand: Errand.fromJson(asJsonMap(json['errand'])),
      quote: quote,
    );
  }
}
