import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

TextStyle? _style(WidgetTester tester, String text) =>
    tester.widget<Text>(find.text(text)).style;

BoxDecoration _dot(WidgetTester tester) =>
    tester
            .widget<Container>(find.byKey(const ValueKey('availability-dot')))
            .decoration!
        as BoxDecoration;

void main() {
  test('kesSemanticsLabel', () {
    expect(kesSemanticsLabel('1750.00'), '1,750 shillings');
    expect(kesSemanticsLabel(-6000), 'minus 6,000 shillings');
  });

  group('AvailabilityCard (R-02)', () {
    testWidgets('online: green dot, white title, blue-050 Fira Code areas', (
      tester,
    ) async {
      bool? changed;
      await pumpThemed(
        tester,
        AvailabilityCard(
          online: true,
          areas: 'Westlands · Kilimani',
          onChanged: (v) => changed = v,
        ),
      );
      expect(_dot(tester).color, NitumeColors.green);
      expect(_style(tester, 'Online')!.color, NitumeColors.white);
      final areas = _style(tester, 'Westlands · Kilimani')!;
      expect(areas.fontFamily, NitumeTypography.numericFamily);
      expect(areas.color, NitumeColors.blue050);
      await tester.tap(find.byType(Switch));
      expect(changed, false);
      expect(
        find.bySemanticsLabel(AvailabilityCard.switchLabel),
        findsOneWidget,
      );
    });

    testWidgets('offline and disabled shows the reason', (tester) async {
      await pumpThemed(
        tester,
        const AvailabilityCard(
          online: false,
          areas: 'No service areas yet',
          onChanged: null,
          disabledReason:
              'You can go online once your verification is approved.',
        ),
      );
      expect(_dot(tester).color, NitumeColors.slate400);
      expect(find.text('Offline'), findsOneWidget);
      expect(
        find.text('You can go online once your verification is approved.'),
        findsOneWidget,
      );
      expect(tester.widget<Switch>(find.byType(Switch)).onChanged, isNull);
    });
  });

  group('JobOfferCard (R-04)', () {
    testWidgets('layout, fonts and actions', (tester) async {
      var accepted = 0, declined = 0, opened = 0;
      await pumpThemed(
        tester,
        Padding(
          padding: const EdgeInsets.all(20),
          child: JobOfferCard(
            category: ErrandCategory.checkItForMe.label,
            payAmount: '1750.00',
            title: 'Check apartment — Nyali',
            meta: '1.2 km away · Photos required',
            onAccept: () => accepted++,
            onDecline: () => declined++,
            onTap: () => opened++,
          ),
        ),
      );
      expect(find.byType(NitumeTag), findsOneWidget);
      final pay = _style(tester, 'KSh 1,750')!;
      expect(pay.fontFamily, NitumeTypography.numericFamily);
      expect(pay.fontSize, 17);
      expect(pay.fontWeight, FontWeight.w600);
      final meta = _style(tester, '1.2 km away · Photos required')!;
      expect(meta.fontFamily, NitumeTypography.numericFamily);
      expect(meta.color, NitumeColors.slate600);
      expect(_style(tester, 'Check apartment — Nyali')!.fontSize, 14);

      await tester.tap(find.text('Accept'));
      await tester.tap(find.text('Decline'));
      await tester.tap(find.text('Check apartment — Nyali'));
      expect((accepted, declined, opened), (1, 1, 1));
    });

    testWidgets('accepting disables both buttons; notice slot shows', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        JobOfferCard(
          category: 'Buy For Me',
          payAmount: 720,
          title: 'Grocery run',
          notice: const NitumeNotice(
            message: 'Above your purchase limit of KSh 3,000. You can decline this job.',
          ),
          onAccept: () {},
          onDecline: () {},
          accepting: true,
        ),
      );
      expect(find.byType(NitumeNotice), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final buttons = tester.widgetList<NitumeButton>(
        find.byType(NitumeButton),
      );
      expect(buttons.first.onPressed, isNull);
    });
  });
}
