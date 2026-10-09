import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

class _FakePlaces implements PlaceSearchService {
  final queries = <String>[];
  final sessions = <String>{};

  @override
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  }) async {
    queries.add(query);
    sessions.add(sessionToken);
    return const [
      PlaceSuggestion(
        placeId: 'p1',
        primaryText: 'Nyali',
        secondaryText: 'Mombasa',
      ),
    ];
  }

  @override
  Future<PlaceDetails> details(
    String placeId, {
    required String sessionToken,
  }) async {
    sessions.add(sessionToken);
    return const PlaceDetails(
      placeId: 'p1',
      addressText: 'Nyali, Mombasa',
      lat: -4.04,
      lng: 39.7,
    );
  }
}

void main() {
  testWidgets('debounces, searches once, resolves the picked place',
      (tester) async {
    final places = _FakePlaces();
    PlaceDetails? picked;
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: places,
        onPlaceSelected: (p) => picked = p,
      ),
    );
    await tester.enterText(find.byType(TextField), 'Ny');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'Nya');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    expect(places.queries, ['Nya']);

    await tester.tap(find.text('Nyali'));
    await tester.pump();
    expect(picked?.addressText, 'Nyali, Mombasa');
    expect(places.sessions, hasLength(1), reason: 'one session per search');
  });

  testWidgets('initialValue shows as field text and follows updates',
      (tester) async {
    Widget build(String? v) => PlaceAutocompleteField(
          service: _FakePlaces(),
          onPlaceSelected: (_) {},
          hint: 'Search a place',
          initialValue: v,
        );
    await pumpThemed(tester, build('Nyali, Mombasa'));
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller!.text, 'Nyali, Mombasa');
    expect(find.text('Nyali, Mombasa'), findsOneWidget);
    await pumpThemed(tester, build('Bamburi, Mombasa'));
    expect(field.controller!.text, 'Bamburi, Mombasa');
  });
}
