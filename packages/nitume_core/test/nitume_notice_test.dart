import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

BoxDecoration _card(WidgetTester tester) =>
    tester
            .widget<Container>(
              find
                  .descendant(
                    of: find.byType(NitumeNotice),
                    matching: find.byType(Container),
                  )
                  .first,
            )
            .decoration!
        as BoxDecoration;

void main() {
  group('NitumeNotice tone (C-40, C3)', () {
    testWidgets('default stays info: slate-600 info icon', (tester) async {
      await pumpThemed(tester, const NitumeNotice(message: 'Hello'));
      final icon = tester.widget<Icon>(find.byIcon(Icons.info_outline_rounded));
      expect(icon.color, NitumeColors.slate600);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
    });

    testWidgets('danger: red error icon only; white card, slate text', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        const NitumeNotice(
          message: 'This photo is larger than 10 MB. Take it again.',
          tone: NitumeNoticeTone.danger,
          showIcon: false,
        ),
      );
      final icon = tester.widget<Icon>(
        find.byIcon(Icons.error_outline_rounded),
      );
      expect(icon.color, NitumeColors.red);
      expect(icon.size, 18);
      expect(find.byIcon(Icons.info_outline_rounded), findsNothing);
      final card = _card(tester);
      expect(card.color, NitumeColors.white);
      expect((card.border! as Border).top.color, NitumeColors.slateLine);
      final text = tester.widget<Text>(
        find.text('This photo is larger than 10 MB. Take it again.'),
      );
      expect(text.style!.color, NitumeColors.slate600);
    });
  });
}
