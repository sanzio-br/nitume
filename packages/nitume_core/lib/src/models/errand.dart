import 'enums.dart';

/// An errand (`errands`). Monetary fields are kept as decimal strings exactly as
/// the API returns them (`numeric(12,2)`), never as floating point.
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

  final DateTime? deadlineAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

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
    );
  }
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
