import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

Future<void> _pump(
  WidgetTester tester,
  Widget cta, {
  EdgeInsets? insets,
}) async {
  await tester.binding.setSurfaceSize(const Size(375, 700));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MaterialApp(
      theme: NitumeTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(375, 700),
          viewInsets: insets ?? EdgeInsets.zero,
          padding: const EdgeInsets.only(bottom: 34),
        ),
        child: Scaffold(body: const SizedBox(), bottomNavigationBar: cta),
      ),
    ),
  );
}

void main() {
  group('NitumeFixedCta (C5)', () {
    testWidgets('20 side margin, 6 above the safe area, 8 on top', (
      tester,
    ) async {
      await _pump(
        tester,
        NitumeFixedCta(
          child: NitumeButton.primary(
            label: 'Continue',
            expand: true,
            onPressed: () {},
          ),
        ),
      );
      final button = tester.getRect(find.byType(NitumeButton));
      final cta = tester.getRect(find.byType(NitumeFixedCta));
      expect(button.left, 20);
      expect(button.width, 375 - 40);
      expect(button.top - cta.top, 8);
      expect(cta.bottom - button.bottom, 6 + 34);
    });

    testWidgets('above sits 10 over the button', (tester) async {
      await _pump(
        tester,
        NitumeFixedCta(
          above: const Text('Quote expired'),
          child: NitumeButton.primary(label: 'Pay', onPressed: () {}),
        ),
      );
      final above = tester.getRect(find.text('Quote expired'));
      final button = tester.getRect(find.byType(NitumeButton));
      expect(button.top - above.bottom, 10);
      expect(button.width, 375 - 40, reason: 'stretched');
    });

    testWidgets('rides above the keyboard', (tester) async {
      await _pump(
        tester,
        NitumeFixedCta(
          child: NitumeButton.primary(label: 'Save', onPressed: () {}),
        ),
        insets: const EdgeInsets.only(bottom: 300),
      );
      final padding = tester.widget<Padding>(
        find
            .descendant(
              of: find.byType(NitumeFixedCta),
              matching: find.byType(Padding),
            )
            .first,
      );
      expect(padding.padding, const EdgeInsets.only(bottom: 300));
    });
  });
}
