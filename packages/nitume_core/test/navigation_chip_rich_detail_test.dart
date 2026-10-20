import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// Font family per text run of the RichText that contains [needle].
Map<String, String?> _families(WidgetTester tester, String needle) {
  final rich = tester
      .widgetList<RichText>(find.byType(RichText))
      .firstWhere((r) => r.text.toPlainText().contains(needle));
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
  testWidgets('richDetail: words in Fira Sans, numbers in Fira Code', (
    tester,
  ) async {
    await pumpThemed(
      tester,
      NavigationChip(
        destination: 'Links Road, Nyali',
        detail: '1.2 km · Pickup',
        richDetail: const TextSpan(
          children: [
            NumSpan('1.2 km'),
            TextSpan(text: ' · Pickup'),
          ],
        ),
        onNavigate: () {},
      ),
    );
    final f = _families(tester, 'Pickup');
    expect(f['1.2 km'], NitumeTypography.numericFamily);
    expect(f[' · Pickup'], NitumeTypography.uiFamily);
    expect(
      find.bySemanticsLabel('Links Road, Nyali, 1.2 km · Pickup'),
      findsOneWidget,
    );
  });

  testWidgets('all-text detail: Fira Sans only', (tester) async {
    await pumpThemed(
      tester,
      NavigationChip(
        destination: 'Links Road, Nyali',
        detail: 'Distance unavailable',
        richDetail: const TextSpan(text: 'Distance unavailable'),
        onNavigate: () {},
      ),
    );
    expect(
      _families(tester, 'Distance unavailable')['Distance unavailable'],
      NitumeTypography.uiFamily,
    );
  });

  testWidgets('plain detail still Fira Code (old API)', (tester) async {
    await pumpThemed(
      tester,
      NavigationChip(
        destination: 'Links Road, Nyali',
        detail: '1.2 km · 6 min',
        onNavigate: () {},
      ),
    );
    expect(
      _families(tester, '6 min')['1.2 km · 6 min'],
      NitumeTypography.numericFamily,
    );
  });

  test('richDetail needs detail', () {
    expect(
      () => NavigationChip(
        destination: 'x',
        richDetail: const TextSpan(text: 'y'),
        onNavigate: null,
      ),
      throwsAssertionError,
    );
  });
}
