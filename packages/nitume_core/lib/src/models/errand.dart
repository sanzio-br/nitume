import 'enums.dart';
import 'errand_location.dart';
import 'json_utils.dart';
import 'runner.dart';

/// An errand (`errands`). Monetary fields are kept as decimal strings exactly as
/// the API returns them (`numeric(12,2)`), never as floating point.
///
/// Owner-approved fields ([reference], [title], [runnerNotes], [items],
/// [locations]; Q15, Q16, Q19) are returned by `GET /errands/:id` and the
/// list endpoints. They stay nullable and parse tolerantly (an absent or
/// malformed value is `null`, bad list entries are skipped) so older
/// responses still load. Screens must not derive them client-side (e.g.
/// never build a reference from [id]).
class Errand {
  const Errand({
    required this.id,
    required this.customerId,
    required this.category,
    required this.description,
    required this.status,
    required this.urgency,
    required this.budget,
    this.quotedPrice,
    this.finalPrice,
    this.deadlineAt,
    this.createdAt,
    this.updatedAt,
    this.assignment,
    this.reference,
    this.title,
    this.runnerNotes,
    this.items,
    this.locations,
  });

  final String id;
  final String customerId;
  final ErrandCategory category;
  final String description;
  final ErrandStatus status;
  final ErrandUrgency urgency;

  /// Customer's indicative budget, as a decimal string.
  final String budget;

  /// Runner's quote, set when the errand moves to `QUOTED`.
  final String? quotedPrice;

  /// Agreed final price, set after payment.
  final String? finalPrice;

  /// Authoritative deadline (Q19, decided). Urgency for display is derived
  /// from it by the screen when needed; [urgency] is the API value.
  final DateTime? deadlineAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Runner currently holding the errand; `null` until assigned.
  final ErrandAssignment? assignment;

  /// Backend-generated human-readable reference, `NT-10001` format (Q15).
  /// Display as `#` + this value. Never derived client-side.
  final String? reference;

  /// Optional customer task title (Q15). Editable with
  /// `ErrandRepository.updateTitle`.
  final String? title;

  /// Runner-provided notes shown on evidence review (Q16, decided;
  /// `runnerNotes`). Separate from the customer's [description].
  final String? runnerNotes;

  /// Structured shopping-list items (Q19); `null` when the response has no
  /// `items` list.
  final List<ErrandItem>? items;

  /// Errand points: pickup + drop-off for Buy For Me / Get It For Me, task
  /// site otherwise (Q19); `null` when the response has no `locations` list.
  final List<ErrandLocation>? locations;

  /// First pickup point in [locations], if any.
  ErrandLocation? get pickup => _point(ErrandPointType.pickup);

  /// First drop-off point in [locations], if any.
  ErrandLocation? get dropoff => _point(ErrandPointType.dropoff);

  /// First task-site point in [locations], if any.
  ErrandLocation? get taskSite => _point(ErrandPointType.taskSite);

  ErrandLocation? _point(ErrandPointType type) {
    for (final l in locations ?? const <ErrandLocation>[]) {
      if (l.pointType == type) return l;
    }
    return null;
  }

  RunnerSummary? get runner => assignment?.runner;

  /// The price to display: final if agreed, otherwise the quote.
  String? get displayPrice => finalPrice ?? quotedPrice;

  double? get quotedPriceValue => _toDouble(quotedPrice);
  double? get finalPriceValue => _toDouble(finalPrice);
  double get budgetValue => _toDouble(budget) ?? 0;

  factory Errand.fromJson(Map<String, dynamic> json) {
    return Errand(
      id: json['id'] as String,
      customerId: json['customerId'] as String,
      category: ErrandCategory.fromWire(json['category'] as String),
      description: json['description'] as String,
      status: ErrandStatus.fromWire(json['status'] as String),
      urgency: ErrandUrgency.fromWire(json['urgency'] as String),
      budget: _toDecimalString(json['budget']),
      quotedPrice: _nullableDecimalString(json['quotedPrice']),
      finalPrice: _nullableDecimalString(json['finalPrice']),
      deadlineAt: _date(json['deadlineAt']),
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      assignment: json['assignment'] == null
          ? null
          : ErrandAssignment.fromJson(asJsonMap(json['assignment'])),
      reference: parseOptionalString(json['reference']),
      title: parseOptionalString(json['title']),
      runnerNotes: parseOptionalString(json['runnerNotes']),
      items: _tolerantList(json['items'], ErrandItem.fromJson),
      locations: _tolerantList(json['locations'], ErrandLocation.fromJson),
    );
  }
}

/// One structured shopping-list line on an [Errand] (Q19): the API read
/// shape `{id, name, quantity, unit, notes}`. For `POST /errands` use
/// `ErrandItemInput`.
class ErrandItem {
  const ErrandItem({
    this.id,
    required this.name,
    this.quantity,
    this.unit,
    this.notes,
  });

  final String? id;
  final String name;

  /// 1–999; `null` when not given.
  final int? quantity;
  final String? unit;
  final String? notes;

  factory ErrandItem.fromJson(Map<String, dynamic> json) => ErrandItem(
        id: parseOptionalString(json['id']),
        name: json['name'] as String,
        quantity: (json['quantity'] as num?)?.toInt(),
        unit: parseOptionalString(json['unit']),
        notes: parseOptionalString(json['notes']),
      );
}

/// Parses a list field leniently: `null` if absent or not a list; entries
/// that fail to parse are skipped.
List<T>? _tolerantList<T>(
  Object? value,
  T Function(Map<String, dynamic>) parse,
) {
  if (value is! List) return null;
  final out = <T>[];
  for (final entry in value) {
    if (entry is! Map) continue;
    try {
      out.add(parse(entry.cast<String, dynamic>()));
    } on Object {
      // Tolerant: skip entries we cannot read.
    }
  }
  return out;
}

double? _toDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

String _toDecimalString(Object? value) {
  if (value == null) return '0.00';
  if (value is num) return value.toStringAsFixed(2);
  return value.toString();
}

String? _nullableDecimalString(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toStringAsFixed(2);
  return value.toString();
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;
