import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// The RichText under [finder] that holds text (skips icon glyphs).
RichText _textRich(WidgetTester tester, Finder finder) => tester
    .widgetList<RichText>(
      find.descendant(of: finder, matching: find.byType(RichText)),
    )
    .firstWhere((r) => r.text.toPlainText().trim().length > 1);

/// Families of every leaf span under [finder]'s RichText, keyed by text.
Map<String, String?> _spanFamilies(WidgetTester tester, Finder finder) {
  final rich = _textRich(tester, finder);
  final out = <String, String?>{};
  void walk(InlineSpan span, TextStyle? inherited) {
    if (span is! TextSpan) return;
    final style = inherited?.merge(span.style) ?? span.style;
    if (span.text != null) out[span.text!] = style?.fontFamily;
    for (final c in span.children ?? const <InlineSpan>[]) {
      walk(c, style);
    }
  }

  walk(rich.text, null);
  return out;
}

void main() {
  group('NumSpan (C-32 in mixed text)', () {
    test('Fira Code family, inherits the rest', () {
      const span = NumSpan('3/5');
      expect(span.text, '3/5');
      expect(span.style?.fontFamily, NitumeTypography.numericFamily);
      expect(span.style?.fontSize, isNull);
      expect(span.style?.color, isNull);
      expect(NumSpan.kes(5000).text, formatKes(5000));
    });
  });

  group('NitumeButton.richLabel (CC-2)', () {
    testWidgets('renders the amount in Fira Code, words in Fira Sans', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        NitumeButton.primary(
          label: 'Approve KSh 5,000 increase',
          richLabel: TextSpan(
            children: [
              const TextSpan(text: 'Approve '),
              NumSpan.kes(5000),
              const TextSpan(text: ' increase'),
            ],
          ),
          onPressed: () {},
        ),
      );
      final families = _spanFamilies(tester, find.byType(FilledButton));
      expect(families['Approve '], NitumeTypography.uiFamily);
      expect(families['KSh 5,000'], NitumeTypography.numericFamily);
      expect(
        find.bySemanticsLabel('Approve KSh 5,000 increase'),
        findsOneWidget,
      );
    });

    testWidgets('link variant keeps green-700 on the numeric span', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        NitumeButton.link(
          label: '+3 more in progress',
          richLabel: const TextSpan(
            children: [
              TextSpan(text: '+'),
              NumSpan('3'),
              TextSpan(text: ' more in progress'),
            ],
          ),
          onPressed: () {},
        ),
      );
      final rich = tester.widget<RichText>(
        find.descendant(
          of: find.byType(TextButton),
          matching: find.byType(RichText),
        ),
      );
      expect(rich.text.style?.color, NitumeColors.green700);
      expect(
        _spanFamilies(tester, find.byType(TextButton))['3'],
        NitumeTypography.numericFamily,
      );
    });

    testWidgets('String-only callers are unchanged', (tester) async {
      await pumpThemed(
        tester,
        NitumeButton.primary(label: 'Continue', onPressed: () {}),
      );
      expect(find.text('Continue'), findsOneWidget);
    });
  });

  group('NitumeNotice.richMessage (CC-2)', () {
    testWidgets('renders the amount in Fira Code', (tester) async {
      await pumpThemed(
        tester,
        NitumeNotice(
          message: 'Pay the item amount: KSh 40,000',
          richMessage: TextSpan(
            children: [
              const TextSpan(text: 'Pay the item amount: '),
              NumSpan.kes(40000),
            ],
          ),
        ),
      );
      final families = _spanFamilies(tester, find.byType(NitumeNotice));
      expect(families['Pay the item amount: '], NitumeTypography.uiFamily);
      expect(families['KSh 40,000'], NitumeTypography.numericFamily);
      final rich = _textRich(tester, find.byType(NitumeNotice));
      expect(rich.text.style?.color, NitumeColors.slate600);
    });
  });

  group('SectionLabel.numericSuffix (CC-2)', () {
    testWidgets('upper-cases the text and keeps the count in Fira Code', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        const SectionLabel('Photos & video', numericSuffix: '(4)'),
      );
      final families = _spanFamilies(tester, find.byType(SectionLabel));
      expect(families['PHOTOS & VIDEO '], NitumeTypography.uiFamily);
      expect(families['(4)'], NitumeTypography.numericFamily);
      expect(find.bySemanticsLabel('Photos & video (4)'), findsOneWidget);
    });
  });
}
