import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// Effective label colour of the Material button that renders [label].
Color? _labelColor(WidgetTester tester, String label) {
  final text = tester.widget<RichText>(
    find.descendant(of: find.text(label), matching: find.byType(RichText)),
  );
  return text.text.style?.color;
}

void main() {
  group('NitumeButton destructive', () {
    testWidgets('outline and text variants use red labels', (tester) async {
      await pumpThemed(
        tester,
        Column(
          children: [
            NitumeButton.outline(
              label: 'Reject & cancel',
              onPressed: () {},
              destructive: true,
            ),
            NitumeButton.text(
              label: 'Delete address',
              onPressed: () {},
              destructive: true,
            ),
            NitumeButton.outline(label: 'Back to Home', onPressed: () {}),
          ],
        ),
      );
      expect(_labelColor(tester, 'Reject & cancel'), NitumeColors.red);
      expect(_labelColor(tester, 'Delete address'), NitumeColors.red);
      expect(_labelColor(tester, 'Back to Home'), NitumeColors.blue);
    });
  });
}
