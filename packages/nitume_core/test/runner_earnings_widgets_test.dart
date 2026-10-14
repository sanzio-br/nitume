import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

TextStyle? _style(WidgetTester tester, String text) =>
    tester.widget<Text>(find.text(text)).style;

Color? _barColor(WidgetTester tester, int i) =>
    (tester.widget<Container>(find.byKey(ValueKey('weekly-bar-$i'))).decoration
            as BoxDecoration?)
        ?.color;

void main() {
  group('BalanceCard (R-08)', () {
    testWidgets('amount 30/600 white Fira Code, outline actions, info', (
      tester,
    ) async {
      var info = 0, payout = 0;
      await pumpThemed(
        tester,
        Padding(
          padding: const EdgeInsets.all(20),
          child: BalanceCard(
            amount: '8450.00',
            subLines: const ['KSh 2,450 pending confirmation'],
            onInfo: () => info++,
            actions: [
              (label: 'Request payout', onPressed: () => payout++),
              (label: 'Payout history', onPressed: () {}),
            ],
          ),
        ),
      );
      final amount = _style(tester, 'KSh 8,450')!;
      expect(amount.fontFamily, NitumeTypography.numericFamily);
      expect(amount.fontSize, 30);
      expect(amount.fontWeight, FontWeight.w600);
      expect(amount.color, NitumeColors.white);
      expect(_style(tester, 'Available balance')!.color, NitumeColors.blue050);
      final sub = _style(tester, 'KSh 2,450 pending confirmation')!;
      expect(sub.fontFamily, NitumeTypography.numericFamily);
      expect(sub.color, NitumeColors.blue050);
      final buttons = tester.widgetList<NitumeButton>(
        find.byType(NitumeButton),
      );
      expect(
        buttons.map((b) => b.variant),
        everyElement(NitumeButtonVariant.outline),
      );
      await tester.tap(find.text('Request payout'));
      await tester.tap(find.byIcon(Icons.info_outline_rounded));
      expect((payout, info), (1, 1));
      expect(
        find.bySemanticsLabel('Available balance, 8,450 shillings'),
        findsOneWidget,
      );
    });

    testWidgets('no info button or actions by default', (tester) async {
      await pumpThemed(tester, const BalanceCard(amount: 0));
      expect(find.text('KSh 0'), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
      expect(find.byType(NitumeButton), findsNothing);
    });
  });

  group('WeeklyBarChart (R-11)', () {
    testWidgets('today blue, others blue-050, heights relative to max', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        const Padding(
          padding: EdgeInsets.all(20),
          child: WeeklyBarChart(
            amounts: [0, '720.00', 1750, 500, 0, 0, 0],
            todayIndex: 2,
            total: 2970,
          ),
        ),
      );
      expect(_barColor(tester, 2), NitumeColors.blue);
      expect(_barColor(tester, 1), NitumeColors.blue050);
      for (var i = 0; i < 7; i++) {
        expect(_barColor(tester, i), isNot(NitumeColors.green));
      }
      final h2 = tester
          .getSize(find.byKey(const ValueKey('weekly-bar-2')))
          .height;
      final h0 = tester
          .getSize(find.byKey(const ValueKey('weekly-bar-0')))
          .height;
      expect(h2, WeeklyBarChart.barsHeight);
      expect(h0, WeeklyBarChart.minBarHeight);
      expect(find.text('THIS WEEK'), findsOneWidget);
      expect(
        _style(tester, 'KSh 2,970')!.fontFamily,
        NitumeTypography.numericFamily,
      );
      expect(find.text('M'), findsOneWidget);
      expect(find.text('T'), findsNWidgets(2));
      expect(_style(tester, 'M')!.fontFamily, NitumeTypography.numericFamily);
      expect(find.bySemanticsLabel('Wednesday, KSh 1,750'), findsOneWidget);
    });

    testWidgets('empty week renders stubs', (tester) async {
      await pumpThemed(
        tester,
        const WeeklyBarChart(amounts: [0, 0, 0, 0, 0, 0, 0]),
      );
      final h = tester
          .getSize(find.byKey(const ValueKey('weekly-bar-3')))
          .height;
      expect(h, WeeklyBarChart.minBarHeight);
    });
  });

  group('LedgerLineRow (R-12)', () {
    testWidgets('signed amounts in blue Fira Code; caption parts', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        const Column(
          children: [
            LedgerLineRow(
              title: 'Apartment check — Nyali',
              caption: 'Runner fee',
              status: StatusChip(
                label: 'Pending',
                tone: StatusTone.pending,
                size: StatusChipSize.compact,
              ),
              amount: '1750.00',
            ),
            LedgerLineRow(
              title: 'Payout to M-Pesa',
              caption: 'Sent',
              captionNumeric: 'Mon, 10:03 AM',
              amount: '-6000.00',
            ),
          ],
        ),
      );
      final plus = _style(tester, '+ KSh 1,750')!;
      final minus = _style(tester, '− KSh 6,000')!;
      for (final s in [plus, minus]) {
        expect(s.fontFamily, NitumeTypography.numericFamily);
        expect(s.color, NitumeColors.blue);
        expect(s.fontWeight, FontWeight.w600);
      }
      expect(find.text('Pending'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          'Payout to M-Pesa, Sent, Mon, 10:03 AM, minus 6,000 shillings',
        ),
        findsOneWidget,
      );
    });
  });
}
