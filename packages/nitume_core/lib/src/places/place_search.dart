import 'dart:math';

/// An autocomplete suggestion.
class PlaceSuggestion {
  const PlaceSuggestion({
    required this.placeId,
    required this.primaryText,
    this.secondaryText,
  });

  final String placeId;
  final String primaryText;
  final String? secondaryText;
}

/// A resolved place, ready for `ErrandLocation`.
class PlaceDetails {
  const PlaceDetails({
    required this.placeId,
    required this.addressText,
    required this.lat,
    required this.lng,
  });

  final String placeId;
  final String addressText;
  final double lat;
  final double lng;
}

/// Place search used by `PlaceAutocompleteField`.
///
/// `GooglePlaceSearchService` is the Google Places implementation (row 30).
/// Every result a screen keeps must come from [details], which always has
/// coordinates (row 60).
abstract interface class PlaceSearchService {
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  });

  Future<PlaceDetails> details(String placeId, {required String sessionToken});
}

/// Random autocomplete session token (one per search session, §5).
String newPlacesSessionToken([Random? random]) {
  final r = random ?? Random.secure();
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return List.generate(32, (_) => chars[r.nextInt(chars.length)]).join();
}
