import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

TextStyle? _style(WidgetTester tester, String text) =>
    tester.widget<Text>(find.text(text)).style;

void main() {
  group('NitumeTag (R-14)', () {
    testWidgets('chip-info colours, 11/600, no dot', (tester) async {
      await pumpThemed(tester, const Center(child: NitumeTag('Buy For Me')));
      final style = _style(tester, 'Buy For Me')!;
      expect(style.color, NitumeColors.blue);
      expect(style.fontSize, 11);
      expect(style.fontWeight, FontWeight.w600);
      expect(style.fontFamily, NitumeTypography.uiFamily);
      final box = tester.widget<DecoratedBox>(
        find.ancestor(
          of: find.text('Buy For Me'),
          matching: find.byType(DecoratedBox),
        ),
      );
      expect((box.decoration as BoxDecoration).color, NitumeColors.blue050);
      expect(find.byKey(const ValueKey('status-chip-dot')), findsNothing);
    });
  });

  group('InfoRow (R-05)', () {
    testWidgets('numeric values use Fira Code, text values Fira Sans', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        const InfoRowList(
          rows: [
            InfoRow.numeric(label: 'Distance', value: '1.2 km'),
            InfoRow(
              label: 'How it\'s paid',
              value: 'Customer pays the merchant',
            ),
            InfoRow.trailing(
              label: 'National ID',
              trailing: StatusChip(
                label: 'Verified',
                tone: StatusTone.success,
                size: StatusChipSize.compact,
              ),
            ),
          ],
        ),
      );
      expect(_style(tester, 'Distance')!.fontFamily, NitumeTypography.uiFamily);
      expect(_style(tester, 'Distance')!.fontSize, 13);
      expect(
        _style(tester, '1.2 km')!.fontFamily,
        NitumeTypography.numericFamily,
      );
      expect(
        _style(tester, 'Customer pays the merchant')!.fontFamily,
        NitumeTypography.uiFamily,
      );
      expect(find.text('Verified'), findsOneWidget);
      // Hairlines between rows only: 3 rows → 2 hairlines.
      expect(find.byType(Divider), findsNWidgets(2));
      expect(find.bySemanticsLabel('Distance, 1.2 km'), findsOneWidget);
    });

    testWidgets('below widget sits under the label', (tester) async {
      await pumpThemed(
        tester,
        InfoRow.trailing(
          label: 'National ID',
          trailing: const StatusChip(
            label: 'Not approved',
            tone: StatusTone.danger,
          ),
          below: NitumeButton.link(label: 'Upload again', onPressed: () {}),
        ),
      );
      expect(
        tester.getTopLeft(find.text('Upload again')).dy,
        greaterThan(tester.getTopLeft(find.text('National ID')).dy),
      );
    });
  });

  group('StatTile / StatRow3 (R-10)', () {
    testWidgets('value Fira Code 16/600, label upper-case 10', (tester) async {
      await pumpThemed(
        tester,
        const Padding(
          padding: EdgeInsets.all(20),
          child: StatRow3(
            first: StatTile(value: '137', label: 'Errands'),
            second: StatTile(value: '4.9', label: 'Rating'),
            third: StatTile(value: '98.7%', label: 'Completion'),
          ),
        ),
      );
      final v = _style(tester, '137')!;
      expect(v.fontFamily, NitumeTypography.numericFamily);
      expect(v.fontSize, 16);
      expect(v.fontWeight, FontWeight.w600);
      final l = _style(tester, 'ERRANDS')!;
      expect(l.fontFamily, NitumeTypography.uiFamily);
      expect(l.fontSize, 10);
      expect(l.color, NitumeColors.slate600);
      // Equal widths.
      final a = tester.getSize(find.byType(StatTile).at(0));
      final b = tester.getSize(find.byType(StatTile).at(2));
      expect(a.width, closeTo(b.width, 0.01));
      expect(find.bySemanticsLabel('137 errands'), findsOneWidget);
    });
  });

  testWidgets('SectionLabel numericPrefix renders the count in Fira Code', (
    tester,
  ) async {
    await pumpThemed(
      tester,
      const SectionLabel('offers near you', numericPrefix: '3'),
    );
    final rich = tester.widget<Text>(find.byType(Text).last);
    final spans = (rich.textSpan! as TextSpan).children!;
    expect((spans.first as TextSpan).text, '3 ');
    expect(
      (spans.first as TextSpan).style!.fontFamily,
      NitumeTypography.numericFamily,
    );
    expect(find.bySemanticsLabel('3 offers near you'), findsOneWidget);
  });
}
