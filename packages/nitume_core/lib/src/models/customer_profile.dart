/// Customer profile (`customer_profiles`), returned by `GET /customers/me`.
class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.userId,
    this.defaultAddressText,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String userId;
  final String? defaultAddressText;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) {
    return CustomerProfile(
      id: json['id'] as String,
      userId: json['userId'] as String,
      defaultAddressText: json['defaultAddressText'] as String?,
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
    );
  }
}

/// Saved address (`saved_addresses`), returned by `GET /customers/me/addresses`.
class SavedAddress {
  const SavedAddress({
    required this.id,
    required this.label,
    required this.addressText,
    required this.isDefault,
    this.lat,
    this.lon,
  });

  final String id;
  final String label;
  final String addressText;
  final bool isDefault;
  final double? lat;
  final double? lon;

  factory SavedAddress.fromJson(Map<String, dynamic> json) {
    return SavedAddress(
      id: json['id'] as String,
      label: json['label'] as String,
      addressText: json['addressText'] as String,
      isDefault: json['isDefault'] as bool? ?? false,
      lat: _double(json['lat']),
      lon: _double(json['lon']),
    );
  }

  Map<String, dynamic> toJson() => {
        'label': label,
        'addressText': addressText,
        'isDefault': isDefault,
        if (lat != null) 'lat': lat,
        if (lon != null) 'lon': lon,
      };
}

enum PaymentMethodType {
  mpesa('mpesa', 'M-Pesa'),
  card('card', 'Card'),
  bank('bank', 'Bank');

  const PaymentMethodType(this.wire, this.label);

  final String wire;
  final String label;

  static PaymentMethodType fromWire(String value) =>
      PaymentMethodType.values.firstWhere((e) => e.wire == value);
}

/// Saved payment method (`payment_methods`).
class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.type,
    required this.label,
    required this.detail,
    required this.isDefault,
  });

  final String id;
  final PaymentMethodType type;
  final String label;

  /// Masked detail (e.g. `+2547•• •••••887`).
  final String detail;
  final bool isDefault;

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    return PaymentMethod(
      id: json['id'] as String,
      type: PaymentMethodType.fromWire(json['type'] as String),
      label: json['label'] as String,
      detail: json['detail'] as String,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.wire,
        'label': label,
        'detail': detail,
        'isDefault': isDefault,
      };
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

double? _double(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}
