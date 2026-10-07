import 'enums.dart';
import 'json_utils.dart';

/// A latitude/longitude pair (WGS84).
class GeoPoint {
  const GeoPoint({required this.lat, required this.lng});

  final double lat;
  final double lng;

  @override
  bool operator ==(Object other) =>
      other is GeoPoint && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);

  @override
  String toString() => 'GeoPoint($lat, $lng)';
}

/// An errand point (`errand_locations`): pickup, drop-off or task site.
///
/// Sent in `POST /errands` (`ErrandLocationDto`, `lat`/`lon`) and returned by
/// `GET /errands/:id/tracking` (`points[]`, `lat`/`lng`).
class ErrandLocation {
  const ErrandLocation({
    required this.pointType,
    required this.lat,
    required this.lng,
    required this.addressText,
    this.placeId,
  });

  final ErrandPointType pointType;
  final double lat;
  final double lng;
  final String addressText;

  /// Google Places id, when the address came from autocomplete.
  final String? placeId;

  GeoPoint get point => GeoPoint(lat: lat, lng: lng);

  factory ErrandLocation.fromJson(Map<String, dynamic> json) {
    final geo = parseGeoPoint(json['coordinates']);
    return ErrandLocation(
      pointType: ErrandPointType.fromWire(json['pointType'] as String),
      lat: parseDouble(json['lat']) ?? geo?.lat ?? 0,
      lng: parseDouble(json['lng'] ?? json['lon']) ?? geo?.lng ?? 0,
      addressText: json['addressText'] as String,
      placeId: json['placeId'] as String?,
    );
  }

  /// `ErrandLocationDto` for `POST /errands`.
  Map<String, dynamic> toJson() => {
        'pointType': pointType.wire,
        'lat': lat,
        'lon': lng,
        'addressText': addressText,
        if (placeId != null) 'placeId': placeId,
      };
}
