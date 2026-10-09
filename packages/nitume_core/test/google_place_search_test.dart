import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);

  final (int, Object?) Function(RequestOptions) respond;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final (status, body) = respond(options);
    if (status == 0) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'offline',
      );
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: const {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const _autocomplete = {
  'suggestions': [
    {
      'placePrediction': {
        'placeId': 'ChIJ1',
        'text': {'text': 'Carrefour Westgate, Westlands, Nairobi'},
        'structuredFormat': {
          'mainText': {'text': 'Carrefour Westgate'},
          'secondaryText': {'text': 'Westlands, Nairobi'},
        },
      },
    },
    {
      'queryPrediction': {
        'text': {'text': 'carrefour near me'},
      },
    },
    {
      'placePrediction': {
        'placeId': 'ChIJ2',
        'text': {'text': 'Nyali, Mombasa'},
      },
    },
  ],
};

void main() {
  test('no key: unavailable, maybe() is null, calls throw', () async {
    expect(GooglePlaceSearchService.maybe(null), isNull);
    expect(GooglePlaceSearchService.maybe('  '), isNull);
    final s = GooglePlaceSearchService(apiKey: '');
    expect(s.isAvailable, isFalse);
    await expectLater(
      s.autocomplete('nyali', sessionToken: 't'),
      throwsA(
        isA<PlaceSearchException>().having(
          (e) => e.isUnavailable,
          'unavailable',
          isTrue,
        ),
      ),
    );
    expect(GooglePlaceSearchService.maybe('key'), isNotNull);
  });

  test(
    'autocomplete sends key, session and region; parses and caches',
    () async {
      final adapter = _Adapter((_) => (200, _autocomplete));
      final s = GooglePlaceSearchService(
        apiKey: 'key',
        httpClientAdapter: adapter,
        requestHeaders: const {'X-Android-Package': 'ke.nitume.customer'},
      );

      final r = await s.autocomplete(' carrefour ', sessionToken: 'sess1');
      expect(r, hasLength(2));
      expect(r.first.placeId, 'ChIJ1');
      expect(r.first.primaryText, 'Carrefour Westgate');
      expect(r.first.secondaryText, 'Westlands, Nairobi');
      expect(r.last.primaryText, 'Nyali, Mombasa');
      expect(r.last.secondaryText, isNull);

      final req = adapter.requests.single;
      expect(
        req.uri.toString(),
        'https://places.googleapis.com/v1/places:autocomplete',
      );
      expect(req.headers['X-Goog-Api-Key'], 'key');
      expect(req.headers['X-Android-Package'], 'ke.nitume.customer');
      expect(req.headers.containsKey('Authorization'), isFalse);
      expect(req.data, {
        'input': 'carrefour',
        'sessionToken': 'sess1',
        'includedRegionCodes': ['ke'],
        'languageCode': 'en',
      });

      await s.autocomplete('carrefour', sessionToken: 'sess1');
      expect(adapter.requests, hasLength(1), reason: 'cached per session');
      await s.autocomplete('carrefour', sessionToken: 'sess2');
      expect(adapter.requests, hasLength(2));
    },
  );

  test('details returns name + address and coordinates', () async {
    final adapter = _Adapter(
      (_) => (
        200,
        {
          'id': 'ChIJ1',
          'displayName': {'text': 'Carrefour Westgate', 'languageCode': 'en'},
          'formattedAddress': 'Mwanzi Rd, Nairobi, Kenya',
          'location': {'latitude': -1.2571, 'longitude': 36.8031},
        },
      ),
    );
    final s = GooglePlaceSearchService(
      apiKey: 'key',
      httpClientAdapter: adapter,
    );
    final d = await s.details('ChIJ1', sessionToken: 'sess1');
    expect(d.addressText, 'Carrefour Westgate, Mwanzi Rd, Nairobi, Kenya');
    expect(d.lat, -1.2571);
    expect(d.lng, 36.8031);
    final req = adapter.requests.single;
    expect(req.uri.path, '/v1/places/ChIJ1');
    expect(req.uri.queryParameters['sessionToken'], 'sess1');
    expect(
      req.headers['X-Goog-FieldMask'],
      GooglePlaceSearchService.detailsFieldMask,
    );
  });

  test('details without a location is refused (row 60)', () async {
    final s = GooglePlaceSearchService(
      apiKey: 'key',
      httpClientAdapter: _Adapter(
        (_) => (200, {'id': 'x', 'formattedAddress': 'Somewhere'}),
      ),
    );
    await expectLater(
      s.details('x', sessionToken: 't'),
      throwsA(isA<PlaceSearchException>()),
    );
  });

  test('offline and HTTP errors map to PlaceSearchException', () async {
    final offline = GooglePlaceSearchService(
      apiKey: 'key',
      httpClientAdapter: _Adapter((_) => (0, null)),
    );
    await expectLater(
      offline.autocomplete('nyali', sessionToken: 't'),
      throwsA(
        isA<PlaceSearchException>().having(
          (e) => e.isNetworkError,
          'network',
          isTrue,
        ),
      ),
    );
    final denied = GooglePlaceSearchService(
      apiKey: 'key',
      httpClientAdapter: _Adapter((_) => (403, {'error': {}})),
    );
    await expectLater(
      denied.autocomplete('nyali', sessionToken: 't'),
      throwsA(
        isA<PlaceSearchException>()
            .having((e) => e.statusCode, 'status', 403)
            .having((e) => e.isNetworkError, 'network', isFalse),
      ),
    );
  });

  test('composeAddressText keeps a street address as is', () {
    expect(
      GooglePlaceSearchService.composeAddressText(
        'Moi Avenue',
        'Moi Avenue, Nairobi, Kenya',
      ),
      'Moi Avenue, Nairobi, Kenya',
    );
    expect(GooglePlaceSearchService.composeAddressText(null, 'Nyali'), 'Nyali');
  });

  test('AppConfig carries the Places key and maps flag', () {
    final c = AppConfig.fromEnvironment();
    expect(c.placesApiKey, isNull);
    expect(c.mapsEnabled, isFalse);
    expect(const AppConfig(placesApiKey: 'k').placesApiKey, 'k');
  });
}
