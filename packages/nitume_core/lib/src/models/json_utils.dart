// Internal JSON helpers for model parsing. Not exported.

DateTime? parseDate(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

/// Money stays a decimal string exactly as the API sends it (`numeric(12,2)`).
String? parseDecimal(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toStringAsFixed(2);
  return value.toString();
}

String parseDecimalOrZero(Object? value) => parseDecimal(value) ?? '0.00';

double? parseDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

Map<String, dynamic> asJsonMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.cast<String, dynamic>();
  throw FormatException('Expected a JSON object', value);
}

Map<String, dynamic>? asJsonMapOrNull(Object? value) =>
    value == null ? null : asJsonMap(value);

List<Map<String, dynamic>> asJsonList(Object? value) {
  if (value == null) return const [];
  if (value is List) return value.map(asJsonMap).toList();
  throw FormatException('Expected a JSON array', value);
}

/// Reads a GeoJSON Point (`{type: 'Point', coordinates: [lon, lat]}`).
({double lat, double lng})? parseGeoPoint(Object? value) {
  if (value is! Map) return null;
  final coords = value['coordinates'];
  if (coords is! List || coords.length < 2) return null;
  final lng = parseDouble(coords[0]);
  final lat = parseDouble(coords[1]);
  if (lat == null || lng == null) return null;
  return (lat: lat, lng: lng);
}
