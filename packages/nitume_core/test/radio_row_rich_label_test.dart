import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// (family, colour) per text run of the RichText that contains [needle].
Map<String, (String?, Color?)> _runs(WidgetTester tester, String needle) {
  final rich = tester
      .widgetList<RichText>(find.byType(RichText))
      .firstWhere((r) => r.text.toPlainText().contains(needle));
  final out = <String, (String?, Color?)>{};
  void walk(InlineSpan span, TextStyle? inherited) {
    if (span is! TextSpan) return;
    final style = inherited?.merge(span.style) ?? span.style;
    if (span.text != null) out[span.text!] = (style?.fontFamily, style?.color);
    for (final c in span.children ?? const <InlineSpan>[]) {
      walk(c, style);
    }
  }

  walk(rich.text, null);
  return out;
}

void main() {
  Widget row({required bool selected}) => NitumeRadioRow(
    label: 'Until 4:12 PM',
    richLabel: const TextSpan(
      children: [
        TextSpan(text: 'Until '),
        NumSpan('4:12 PM'),
      ],
    ),
    subtitle: 'Receipt window',
    selected: selected,
    onSelected: () {},
  );

  testWidgets('rich label: words Sans, time Fira Code, blue when not '
      'selected', (tester) async {
    await pumpThemed(tester, row(selected: false));
    final r = _runs(tester, '4:12 PM');
    expect(r['Until ']!.$1, NitumeTypography.uiFamily);
    expect(r['4:12 PM']!.$1, NitumeTypography.numericFamily);
    expect(r['4:12 PM']!.$2, NitumeColors.blue);
    expect(
      find.bySemanticsLabel('Until 4:12 PM. Receipt window'),
      findsOneWidget,
    );
  });

  testWidgets('selected: every run white on blue', (tester) async {
    await pumpThemed(tester, row(selected: true));
    final r = _runs(tester, '4:12 PM');
    expect(r['Until ']!.$2, NitumeColors.white);
    expect(r['4:12 PM']!.$2, NitumeColors.white);
  });

  testWidgets('String label API unchanged', (tester) async {
    await pumpThemed(
      tester,
      NitumeRadioRow(label: 'Pay the shop', selected: false, onSelected: () {}),
    );
    expect(find.text('Pay the shop'), findsOneWidget);
  });
}
