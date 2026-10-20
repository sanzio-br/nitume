import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

class _FakePlaces implements PlaceSearchService {
  _FakePlaces({this.failDetails = false, this.failSearch = false});

  final bool failDetails;
  bool failSearch;
  final queries = <String>[];
  final sessions = <String>{};

  @override
  Future<List<PlaceSuggestion>> autocomplete(
    String query, {
    required String sessionToken,
  }) async {
    queries.add(query);
    sessions.add(sessionToken);
    if (failSearch) throw Exception('offline');
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
    if (failDetails) throw Exception('offline');
    return const PlaceDetails(
      placeId: 'p1',
      addressText: 'Nyali, Mombasa',
      lat: -4.04,
      lng: 39.7,
    );
  }
}

void main() {
  testWidgets('debounces, searches once, resolves the picked place', (
    tester,
  ) async {
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

  testWidgets('a failed details lookup picks nothing and keeps the results', (
    tester,
  ) async {
    PlaceDetails? picked;
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(failDetails: true),
        onPlaceSelected: (p) => picked = p,
      ),
    );
    await tester.enterText(find.byType(TextField), 'Nya');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    await tester.tap(find.text('Nyali'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(picked, isNull);
    expect(find.text('Nyali'), findsOneWidget);
  });

  testWidgets('initialValue shows as field text and follows updates', (
    tester,
  ) async {
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

  Future<void> search(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField), text);
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
  }

  testWidgets('editing after a pick clears the selection once', (tester) async {
    var cleared = 0;
    PlaceDetails? picked;
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(),
        onPlaceSelected: (p) => picked = p,
        onSelectionCleared: () => cleared++,
      ),
    );
    await search(tester, 'Nya');
    expect(cleared, 0, reason: 'nothing picked yet');
    await tester.tap(find.text('Nyali'));
    await tester.pump();
    expect(picked, isNotNull);

    await tester.enterText(find.byType(TextField), 'Nyali, Mombas');
    await tester.pump();
    expect(cleared, 1);
    await tester.enterText(find.byType(TextField), 'Nyali, Momba');
    await tester.pump();
    expect(cleared, 1, reason: 'fires once per pick');
  });

  testWidgets('initialValue counts as a pick; saved addresses too', (
    tester,
  ) async {
    var cleared = 0;
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(),
        onPlaceSelected: (_) {},
        onSelectionCleared: () => cleared++,
        initialValue: 'Nyali, Mombasa',
      ),
    );
    await tester.enterText(find.byType(TextField), 'Nyali, Mombasa ');
    await tester.pump();
    expect(cleared, 1);
  });

  testWidgets('a failed search shows the error copy, cleared on typing', (
    tester,
  ) async {
    final places = _FakePlaces(failSearch: true);
    await pumpThemed(
      tester,
      PlaceAutocompleteField(service: places, onPlaceSelected: (_) {}),
    );
    await search(tester, 'Nya');
    final error = find.text("Couldn't search places. Check your connection.");
    expect(error, findsOneWidget);
    expect(
      tester.widget<Text>(error).style?.color,
      NitumeDesignChoices.fieldError,
    );
    expect(find.text('Nyali'), findsNothing);

    places.failSearch = false;
    await search(tester, 'Nyal');
    expect(error, findsNothing);
    expect(find.text('Nyali'), findsOneWidget);
  });

  testWidgets('onTextChanged reports typing and picks, once per change', (
    tester,
  ) async {
    final texts = <String>[];
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(),
        onPlaceSelected: (_) {},
        initialValue: 'Home',
        onTextChanged: texts.add,
      ),
    );
    expect(texts, isEmpty, reason: 'the initial value is not an edit');

    await tester.enterText(find.byType(TextField), 'Nya');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    await tester.tap(find.text('Nyali'));
    await tester.pump();
    expect(texts, ['Nya', 'Nyali, Mombasa']);
  });

  testWidgets('works without onTextChanged', (tester) async {
    await pumpThemed(
      tester,
      PlaceAutocompleteField(service: _FakePlaces(), onPlaceSelected: (_) {}),
    );
    await tester.enterText(find.byType(TextField), 'Ny');
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a screen focuses the field through focusNode (m-2)', (
    tester,
  ) async {
    final node = FocusNode();
    addTearDown(node.dispose);
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(),
        onPlaceSelected: (_) {},
        focusNode: node,
        savedAddresses: const [
          SavedAddress(
            id: 'a1',
            label: 'Home',
            addressText: 'Nyali, Mombasa',
            isDefault: true,
          ),
        ],
        onSavedAddressSelected: (_) {},
      ),
    );
    expect(node.hasFocus, isFalse);
    expect(find.text('Home'), findsNothing);
    node.requestFocus();
    await tester.pump();
    expect(node.hasFocus, isTrue);
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.focusNode, same(node));
    expect(find.text('Home'), findsOneWidget, reason: 'focus rebuilds');

    // The field never disposes the caller's node.
    await pumpThemed(tester, const SizedBox());
    node.requestFocus();
  });

  testWidgets('autofocus focuses the field on first build', (tester) async {
    await pumpThemed(
      tester,
      PlaceAutocompleteField(
        service: _FakePlaces(),
        onPlaceSelected: (_) {},
        autofocus: true,
      ),
    );
    await tester.pump();
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.focusNode!.hasFocus, isTrue);
  });
}
