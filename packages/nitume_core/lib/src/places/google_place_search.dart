import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;

import 'place_search.dart';

/// A Places call failed. [isNetworkError] is true when Google could not be
/// reached (the field shows `Couldn't search places. Check your
/// connection.`); [isUnavailable] when no API key is configured.
class PlaceSearchException implements Exception {
  const PlaceSearchException(
    this.message, {
    this.isNetworkError = false,
    this.isUnavailable = false,
    this.statusCode,
  });

  final String message;
  final bool isNetworkError;
  final bool isUnavailable;
  final int? statusCode;

  @override
  String toString() => 'PlaceSearchException($statusCode): $message';
}

/// [PlaceSearchService] over the Google Places API (New) HTTP endpoints
/// (BOARD rows 30, 60; system design §5):
///
/// * Autocomplete: `POST https://places.googleapis.com/v1/places:autocomplete`
/// * Place Details: `GET https://places.googleapis.com/v1/places/{id}` with
///   field mask `id,displayName,formattedAddress,location` (Essentials).
///
/// Both carry the caller's session token so one search is billed as one
/// session. Autocomplete answers are cached per session token and query
/// (§5 cost control); the 300 ms debounce lives in `PlaceAutocompleteField`.
///
/// Uses its own [Dio], never `NitumeApiClient`, so Nitume tokens are never
/// sent to Google. Without an API key [isAvailable] is false and every call
/// throws a [PlaceSearchException] with `isUnavailable`; prefer
/// [GooglePlaceSearchService.maybe], which returns `null` then (the screens'
/// existing "no Places" fallback).
class GooglePlaceSearchService implements PlaceSearchService {
  GooglePlaceSearchService({
    required String? apiKey,
    this.regionCodes = const ['ke'],
    this.languageCode = 'en',
    this.requestHeaders = const {},
    @visibleForTesting HttpClientAdapter? httpClientAdapter,
    Duration timeout = const Duration(seconds: 10),
  }) : apiKey = (apiKey?.trim().isEmpty ?? true) ? null : apiKey!.trim(),
       _dio = Dio(
         BaseOptions(
           baseUrl: 'https://places.googleapis.com/v1',
           connectTimeout: timeout,
           receiveTimeout: timeout,
           sendTimeout: timeout,
           responseType: ResponseType.json,
         ),
       ) {
    if (httpClientAdapter != null) _dio.httpClientAdapter = httpClientAdapter;
  }

  /// The service, or `null` when [apiKey] is blank (Places unavailable).
  static GooglePlaceSearchService? maybe(
    String? apiKey, {
    Map<String, String> requestHeaders = const {},
  }) {
    final service = GooglePlaceSearchService(
      apiKey: apiKey,
      requestHeaders: requestHeaders,
    );
    return service.isAvailable ? service : null;
  }

  /// Places API key (`--dart-define=NITUME_PLACES_API_KEY`); `null` = none.
  final String? apiKey;

  /// CLDR region codes results are restricted to. Kenya by default
  /// (Nitume's launch market); pass `const []` for no restriction.
  final List<String> regionCodes;
  final String languageCode;

  /// Extra headers on every call, e.g. `X-Android-Package` /
  /// `X-Android-Cert` or `X-Ios-Bundle-Identifier` when the key is
  /// restricted to the app.
  final Map<String, String> requestHeaders;

  final Dio _dio;
  final _cache = <String, List<PlaceSuggestion>>{};

  static const detailsFieldMask = 'id,displayName,formattedAddress,location';

  /// False without an API key.
  bool get isAvailable => apiKey != null;

  @override
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  }) async {
    final input = query.trim();
    if (input.isEmpty) return const [];
    final cacheKey = '$sessionToken\u0000$input';
    final cached = _cache[cacheKey];
    if (cached != null) return cached;

    final data = await _send(
      () => _dio.post<dynamic>(
        '/places:autocomplete',
        data: {
          'input': input,
          'sessionToken': sessionToken,
          if (regionCodes.isNotEmpty) 'includedRegionCodes': regionCodes,
          'languageCode': languageCode,
        },
        options: Options(headers: _headers()),
      ),
    );
    final out = <PlaceSuggestion>[];
    final suggestions = data is Map ? data['suggestions'] : null;
    if (suggestions is List) {
      for (final s in suggestions) {
        final p = s is Map ? s['placePrediction'] : null;
        if (p is! Map) continue;
        final id = p['placeId'];
        if (id is! String || id.isEmpty) continue;
        final structured = p['structuredFormat'];
        final main = _text(structured is Map ? structured['mainText'] : null);
        final secondary = _text(
          structured is Map ? structured['secondaryText'] : null,
        );
        final full = _text(p['text']);
        final primary = main ?? full;
        if (primary == null) continue;
        out.add(
          PlaceSuggestion(
            placeId: id,
            primaryText: primary,
            secondaryText: secondary,
          ),
        );
      }
    }
    if (_cache.length > 200) _cache.clear();
    _cache[cacheKey] = List.unmodifiable(out);
    return _cache[cacheKey]!;
  }

  @override
  Future<PlaceDetails> details(
    String placeId, {
    required String sessionToken,
  }) async {
    final data = await _send(
      () => _dio.get<dynamic>(
        '/places/${Uri.encodeComponent(placeId)}',
        queryParameters: {
          'sessionToken': sessionToken,
          'languageCode': languageCode,
        },
        options: Options(
          headers: {..._headers(), 'X-Goog-FieldMask': detailsFieldMask},
        ),
      ),
    );
    // A session ends with Place Details: drop its cached answers.
    _cache.removeWhere((k, _) => k.startsWith('$sessionToken\u0000'));

    final location = data is Map ? data['location'] : null;
    final lat = location is Map ? location['latitude'] : null;
    final lng = location is Map ? location['longitude'] : null;
    if (lat is! num || lng is! num) {
      // Row 60: never a place without coordinates.
      throw const PlaceSearchException('This place has no map location.');
    }
    final map = data as Map;
    final name = _text(map['displayName']);
    final address = map['formattedAddress'] is String
        ? (map['formattedAddress'] as String).trim()
        : '';
    return PlaceDetails(
      placeId: map['id'] is String ? map['id'] as String : placeId,
      addressText: composeAddressText(name, address),
      lat: lat.toDouble(),
      lng: lng.toDouble(),
    );
  }

  /// `"<name>, <address>"` unless the address already starts with the name
  /// (a street address), so a picked shop keeps its name.
  @visibleForTesting
  static String composeAddressText(String? name, String address) {
    final n = name?.trim() ?? '';
    if (n.isEmpty) return address;
    if (address.isEmpty) return n;
    if (address.toLowerCase().startsWith(n.toLowerCase())) return address;
    return '$n, $address';
  }

  Map<String, String> _headers() => {
    ...requestHeaders,
    'X-Goog-Api-Key': apiKey!,
  };

  Future<Object?> _send(Future<Response<dynamic>> Function() call) async {
    if (!isAvailable) {
      throw const PlaceSearchException(
        'Place search is not configured.',
        isUnavailable: true,
      );
    }
    try {
      return (await call()).data;
    } on DioException catch (e) {
      final network = switch (e.type) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.receiveTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.connectionError => true,
        _ => false,
      };
      throw PlaceSearchException(
        network ? 'Could not reach place search.' : 'Place search failed.',
        isNetworkError: network,
        statusCode: e.response?.statusCode,
      );
    }
  }

  static String? _text(Object? value) {
    final t = value is Map ? value['text'] : null;
    return t is String && t.trim().isNotEmpty ? t.trim() : null;
  }

  /// Closes the HTTP client.
  void close() => _dio.close(force: true);
}
