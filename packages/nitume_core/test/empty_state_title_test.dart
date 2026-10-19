import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

void main() {
  group('NitumeEmptyState title (C-33, C4)', () {
    testWidgets('no title by default', (tester) async {
      await pumpThemed(tester, const NitumeEmptyState(message: 'No tasks.'));
      expect(find.byType(Text), findsOneWidget);
    });

    testWidgets('title above the message, card title style, a header', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpThemed(
        tester,
        const NitumeEmptyState(
          title: "You're offline",
          message: 'Go online to get job offers near your service areas.',
        ),
      );
      final title = tester.widget<Text>(find.text("You're offline"));
      expect(title.style, NitumeTextStyles.cardTitle);
      expect(title.textAlign, TextAlign.center);
      expect(
        tester.getTopLeft(find.text("You're offline")).dy,
        lessThan(
          tester
              .getTopLeft(
                find.text(
                  'Go online to get job offers near your service areas.',
                ),
              )
              .dy,
        ),
      );
      expect(
        tester.getSemantics(find.text("You're offline")),
        matchesSemantics(label: "You're offline", isHeader: true),
      );
      handle.dispose();
    });
  });
}
