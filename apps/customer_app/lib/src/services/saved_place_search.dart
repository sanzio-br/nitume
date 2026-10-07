import 'package:nitume_core/nitume_core.dart';

/// Fallback [PlaceSearchService] while no Google Places client is approved
/// (BOARD row 30): searches the customer's saved addresses that have
/// coordinates (the errand API requires `lat`/`lon`). No network call.
class SavedPlaceSearch implements PlaceSearchService {
  SavedPlaceSearch(Iterable<SavedAddress> addresses)
    : _addresses = [
        for (final a in addresses)
          if (a.lat != null && a.lon != null) a,
      ];

  static const _prefix = 'saved:';

  final List<SavedAddress> _addresses;

  /// Saved addresses usable for an errand (with coordinates).
  List<SavedAddress> get usable => List.unmodifiable(_addresses);

  /// True for ids produced by this service (not Google place ids).
  static bool isSavedId(String placeId) => placeId.startsWith(_prefix);

  @override
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  }) async {
    final q = query.toLowerCase();
    return [
      for (final a in _addresses)
        if (a.label.toLowerCase().contains(q) ||
            a.addressText.toLowerCase().contains(q))
          PlaceSuggestion(
            placeId: '$_prefix${a.id}',
            primaryText: a.label,
            secondaryText: a.addressText,
          ),
    ];
  }

  @override
  Future<PlaceDetails> details(
    String placeId, {
    required String sessionToken,
  }) async {
    final id = placeId.substring(_prefix.length);
    final a = _addresses.firstWhere((a) => a.id == id);
    return PlaceDetails(
      placeId: placeId,
      addressText: a.addressText,
      lat: a.lat!,
      lng: a.lon!,
    );
  }
}
