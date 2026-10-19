import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/location/location_disclosure_screen.dart';

import 'support/fakes.dart';

void main() {
  group('x-location-disclosure', () {
    testWidgets('Continue asks the OS and returns the permission', (t) async {
      final b = TestBackend();
      b.location.accessNow = LocationAccess.denied;
      LocationAccess? result;
      await b.pumpScreen(
        t,
        Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await Navigator.of(context).push<LocationAccess>(
                MaterialPageRoute(
                  builder: (_) => const LocationDisclosureScreen(),
                ),
              );
            },
            child: const Text('open'),
          ),
        ),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(find.text(LocationDisclosureCopy.heading), findsOneWidget);
      expect(find.text(LocationDisclosureCopy.body2), findsOneWidget);

      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(b.location.requests, 1);
      expect(result, LocationAccess.whileInUse);

      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await t.tap(find.text('Not now'));
      await t.pumpAndSettle();
      expect(b.location.requests, 1);
      expect(result, isNull);
    });
  });
}
