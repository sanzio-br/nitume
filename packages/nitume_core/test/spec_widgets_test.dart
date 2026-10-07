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

Color? _boxColor(WidgetTester tester, Finder f) =>
    (tester.widget<Container>(f).decoration as BoxDecoration?)?.color;

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

  group('NitumeDialog (C-35)', () {
    Future<void> pumpLauncher(
      WidgetTester tester,
      Future<void> Function(BuildContext) onOpen,
    ) async {
      await pumpThemed(
        tester,
        Builder(
          builder: (context) => Center(
            child: NitumeButton.primary(
              label: 'Open',
              onPressed: () => onOpen(context),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
    }

    testWidgets('renders card, scrim, title, body and stacked actions', (
      tester,
    ) async {
      await pumpLauncher(
        tester,
        (context) => NitumeDialog.show<void>(
          context,
          builder: (_) => NitumeDialog(
            title: 'Price change',
            body: 'Approve the difference to continue?',
            content: const Text('compare'),
            error: "Couldn't send your answer. Try again.",
            actions: [
              NitumeButton.primary(label: 'Approve', onPressed: () {}),
              NitumeButton.outline(
                label: 'Reject & cancel task',
                destructive: true,
                onPressed: () {},
              ),
            ],
          ),
        ),
      );

      final barrier = tester.widget<ModalBarrier>(
        find.byType(ModalBarrier).last,
      );
      expect(barrier.color, NitumeDesignChoices.modalScrim);
      expect(NitumeDesignChoices.modalScrim, NitumeColors.blue.withAlpha(0x80));

      final dialog = tester.widget<Dialog>(find.byType(Dialog));
      expect(dialog.backgroundColor, NitumeColors.white);
      expect(
        (dialog.shape! as RoundedRectangleBorder).borderRadius,
        BorderRadius.circular(NitumeRadii.large),
      );
      expect(
        tester
            .getSize(
              find
                  .descendant(
                    of: find.byType(Dialog),
                    matching: find.byType(Material),
                  )
                  .first,
            )
            .width,
        lessThanOrEqualTo(NitumeDialog.maxWidth),
      );

      final title = tester.widget<Text>(find.text('Price change'));
      expect(title.style?.fontSize, 17);
      expect(title.style?.fontWeight, FontWeight.w600);
      expect(find.text('compare'), findsOneWidget);

      final approve = tester.getRect(find.text('Approve'));
      final reject = tester.getRect(find.text('Reject & cancel task'));
      expect(approve.top, lessThan(reject.top));
      expect(
        tester
            .getSize(
              find.descendant(
                of: find.byType(Dialog),
                matching: find.byType(FilledButton),
              ),
            )
            .width,
        tester.getSize(find.byType(OutlinedButton)).width,
      );
      final error = tester.widget<Text>(
        find.text("Couldn't send your answer. Try again."),
      );
      expect(error.style?.color, NitumeColors.red);
    });

    testWidgets('blocking dialog ignores scrim taps and back', (tester) async {
      await pumpLauncher(
        tester,
        (context) => NitumeDialog.show<void>(
          context,
          barrierDismissible: false,
          builder: (_) => const NitumeDialog(title: 'Price change'),
        ),
      );
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.byType(NitumeDialog), findsOneWidget);

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(NitumeDialog), findsOneWidget);
    });

    testWidgets('confirm helper resolves true, false on scrim tap', (
      tester,
    ) async {
      bool? result;
      Future<void> open(BuildContext context) async {
        result = await showNitumeConfirmDialog(
          context,
          title: 'Log out of Nitume?',
          confirmLabel: 'Log out',
          cancelLabel: 'Cancel',
        );
      }

      await pumpLauncher(tester, open);
      expect(_labelColor(tester, 'Log out'), NitumeColors.red);
      await tester.tap(find.text('Log out'));
      await tester.pumpAndSettle();
      expect(result, isTrue);

      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.byType(NitumeDialog), findsNothing);
      expect(result, isFalse);

      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(result, isFalse);
    });
  });

  group('NitumeRadioRow (C-16 radio-row)', () {
    BoxDecoration decorationOf(WidgetTester tester, String label) {
      final box = tester.widget<AnimatedContainer>(
        find.ancestor(
          of: find.text(label),
          matching: find.byType(AnimatedContainer),
        ),
      );
      return box.decoration! as BoxDecoration;
    }

    testWidgets('selected is blue with white text; others slate', (
      tester,
    ) async {
      String? picked;
      await pumpThemed(
        tester,
        Column(
          children: [
            NitumeRadioRow(
              label: 'Pay merchant directly (recommended)',
              subtitle: "You'll see the merchant's Till or Paybill number.",
              selected: true,
              onSelected: () => picked = 'merchant_direct',
            ),
            const SizedBox(height: 8),
            NitumeRadioRow(
              label: 'Send purchase amount to runner',
              subtitle: "You'll get instructions after paying the fees.",
              selected: false,
              onSelected: () => picked = 'customer_to_runner',
            ),
          ],
        ),
      );

      final on = decorationOf(tester, 'Pay merchant directly (recommended)');
      expect(on.color, NitumeColors.blue);
      expect(
        tester
            .widget<Text>(find.text('Pay merchant directly (recommended)'))
            .style
            ?.color,
        NitumeColors.white,
      );
      expect(
        tester
            .widget<Text>(
              find.text("You'll see the merchant's Till or Paybill number."),
            )
            .style
            ?.color,
        NitumeColors.white,
      );

      final off = decorationOf(tester, 'Send purchase amount to runner');
      expect(off.color, NitumeColors.slate);
      expect((off.border! as Border).top.color, NitumeColors.slateLine);
      expect(
        tester
            .widget<Text>(
              find.text("You'll get instructions after paying the fees."),
            )
            .style
            ?.color,
        NitumeColors.slate600,
      );
      expect(on.borderRadius, BorderRadius.circular(NitumeRadii.pill));

      await tester.tap(find.text('Send purchase amount to runner'));
      expect(picked, 'customer_to_runner');
      expect(
        tester.getSize(find.byType(NitumeRadioRow).last).height,
        greaterThanOrEqualTo(48),
      );
    });

    testWidgets('disabled row is slate-400, not tappable, says why', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpThemed(
        tester,
        const NitumeRadioRow(
          label: 'Pay merchant directly (recommended)',
          subtitle: "Available once the merchant's details are added.",
          selected: false,
          onSelected: null,
        ),
      );
      expect(
        tester
            .widget<Text>(find.text('Pay merchant directly (recommended)'))
            .style
            ?.color,
        NitumeColors.slate400,
      );
      expect(
        tester.getSemantics(find.byType(NitumeRadioRow)),
        matchesSemantics(
          label:
              'Pay merchant directly (recommended). '
              "Available once the merchant's details are added.",
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
          hasCheckedState: true,
          isChecked: false,
          isInMutuallyExclusiveGroup: true,
        ),
      );
      handle.dispose();
    });
  });

  group('ReceiptCard (C-18)', () {
    testWidgets('caption and separate group stay out of the total',
        (tester) async {
      await pumpThemed(
        tester,
        const SingleChildScrollView(
          child: ReceiptCard(
            rows: [
              ReceiptRow(label: 'Service fee', amount: 700),
              ReceiptRow(label: 'Runner fee', amount: 1500),
              ReceiptRow(
                label: 'Total (service + runner fee)',
                amount: 2200,
                isTotal: true,
              ),
            ],
            caption: ReceiptCaption('Valid until ', number: '4:30 PM'),
            separate: ReceiptSeparateGroup(
              rows: [ReceiptRow(label: 'Item amount', amount: 40000)],
              note: 'Paid to the merchant directly',
            ),
          ),
        ),
      );
      expect(find.text('KSh 2,200'), findsOneWidget);
      expect(find.text('KSh 40,000'), findsOneWidget);
      expect(find.text('Paid to the merchant directly'), findsOneWidget);

      final caption = tester.widget<Text>(
        find.descendant(
          of: find.byType(ReceiptCaption),
          matching: find.byType(Text),
        ),
      );
      final span = caption.textSpan! as TextSpan;
      expect(caption.style?.color, NitumeColors.slate600);
      expect(caption.style?.fontSize, 12);
      expect(span.toPlainText(), 'Valid until 4:30 PM');
      expect(
        (span.children!.single as TextSpan).style?.fontFamily,
        NitumeTypography.numericFamily,
      );

      // Order: total, caption, separate group.
      final total = tester.getRect(find.text('KSh 2,200'));
      final captionRect = tester.getRect(find.byType(ReceiptCaption));
      final item = tester.getRect(find.text('KSh 40,000'));
      expect(total.bottom, lessThanOrEqualTo(captionRect.top));
      expect(captionRect.bottom, lessThanOrEqualTo(item.top));
    });
  });

  group('NotificationRow (C-28)', () {
    testWidgets('unread: 700 title and red dot under the time',
        (tester) async {
      await pumpThemed(
        tester,
        const Column(
          children: [
            NotificationRow(
              icon: Icons.place_outlined,
              title: 'Brian K. is en route',
              body: 'Apartment check — Nyali · ETA 12 min',
              time: '2m',
              unread: true,
            ),
            NotificationRow(
              icon: Icons.check,
              title: 'Task completed',
              time: 'Yesterday',
            ),
          ],
        ),
      );
      expect(
        tester.widget<Text>(find.text('Brian K. is en route')).style?.fontWeight,
        FontWeight.w700,
      );
      expect(
        tester.widget<Text>(find.text('Task completed')).style?.fontWeight,
        FontWeight.w600,
      );
      final dot = find.byKey(const ValueKey('notification-unread-dot'));
      expect(dot, findsOneWidget);
      expect(_boxColor(tester, dot), NitumeColors.red);
      final dotBox = find.descendant(
        of: dot,
        matching: find.byType(DecoratedBox),
      );
      expect(tester.getSize(dotBox), const Size(7, 7));
      expect(
        tester.getRect(dotBox).top - tester.getRect(find.text('2m')).bottom,
        6,
      );
      expect(
        tester.getSemantics(find.byType(NotificationRow).first).label,
        startsWith('Unread, '),
      );
    });
  });

  group('CategoryGrid (C-15)', () {
    testWidgets('five MVP tiles in a 3 + 2 grid, third cell empty',
        (tester) async {
      ErrandCategory? picked;
      await pumpThemed(
        tester,
        SingleChildScrollView(
          child: CategoryGrid(onSelected: (c) => picked = c),
        ),
        surfaceSize: const Size(390, 600),
      );
      expect(ErrandCategory.customerMvp, mvpCustomerCategories);
      expect(find.byType(CategoryTile), findsNWidgets(5));
      expect(find.text('Business Tasks'), findsNothing);

      Rect tile(ErrandCategory c) => tester.getRect(
            find.widgetWithText(CategoryTile, c.label),
          );
      final buy = tile(ErrandCategory.buyForMe);
      final get = tile(ErrandCategory.getItForMe);
      final check = tile(ErrandCategory.checkItForMe);
      final go = tile(ErrandCategory.goThereForMe);
      final wait = tile(ErrandCategory.waitForMe);

      // Row 1: three tiles; row 2: two tiles under the first two columns.
      expect([get.top, check.top], everyElement(buy.top));
      expect(wait.top, go.top);
      expect(go.top - buy.bottom, 10);
      expect(go.left, buy.left);
      expect(wait.left, get.left);
      // Same width everywhere: the row-2 tiles are not stretched.
      expect([get.width, check.width, go.width, wait.width],
          everyElement(buy.width));
      expect(get.left - buy.right, 10);
      // Padding 0 20 20 inside a 390 wide screen.
      expect(buy.left, 20);
      expect(check.right, 370);
      // Nothing occupies the third cell of row 2.
      final emptyCell = Offset(check.center.dx, go.center.dy);
      for (final element in find.byType(CategoryTile).evaluate()) {
        final box = element.renderObject! as RenderBox;
        final rect = box.localToGlobal(Offset.zero) & box.size;
        expect(rect.contains(emptyCell), isFalse);
      }

      await tester.tap(find.text('Wait For Me'));
      expect(picked, ErrandCategory.waitForMe);
    });
  });

  group('EvidenceViewer (C-25)', () {
    testWidgets('close on the left, Fira Code counter on the right, caption',
        (tester) async {
      await pumpThemed(
        tester,
        EvidenceViewer(
          items: const [
            EvidenceThumbnail(),
            EvidenceThumbnail(),
            EvidenceThumbnail(isVideo: true),
            EvidenceThumbnail(),
          ],
          initialIndex: 1,
          captionBuilder: (context, i) => Text('caption $i'),
        ),
        surfaceSize: const Size(390, 800),
      );
      final counter = find.byKey(const ValueKey('evidence-viewer-counter'));
      final style = tester.widget<Text>(counter).style!;
      expect(tester.widget<Text>(counter).data, '2/4');
      expect(style.fontFamily, NitumeTypography.numericFamily);
      expect(style.color, NitumeColors.white);
      expect(style.fontSize, 12.5);

      final close = find.byTooltip('Close');
      expect(close, findsOneWidget);
      expect(tester.getCenter(close).dx, lessThan(195));
      expect(tester.getCenter(counter).dx, greaterThan(195));
      expect(tester.getSize(close).width, greaterThanOrEqualTo(48));
      expect(find.text('caption 1'), findsOneWidget);

      await tester.drag(find.byType(PageView), const Offset(-400, 0));
      await tester.pumpAndSettle();
      expect(tester.widget<Text>(counter).data, '3/4');
      expect(find.text('caption 2'), findsOneWidget);
    });
  });

  group('NitumeCheckbox (C-36)', () {
    BoxDecoration boxOf(WidgetTester tester) => tester
        .widget<DecoratedBox>(
          find.descendant(
            of: find.byType(NitumeCheckbox),
            matching: find.byType(DecoratedBox),
          ),
        )
        .decoration as BoxDecoration;

    testWidgets('unchecked slate-line box, checked green with white check',
        (tester) async {
      var value = false;
      await pumpThemed(
        tester,
        StatefulBuilder(
          builder: (context, setState) => NitumeCheckbox(
            value: value,
            label: 'Set as default',
            onChanged: (v) => setState(() => value = v),
          ),
        ),
      );
      var box = boxOf(tester);
      expect(box.color, NitumeColors.white);
      expect((box.border! as Border).top.color, NitumeColors.slateLine);
      expect((box.border! as Border).top.width, 2);
      expect(box.borderRadius, BorderRadius.circular(6));
      expect(find.byIcon(Icons.check_rounded), findsNothing);
      expect(
        tester.getSize(
          find.descendant(
            of: find.byType(NitumeCheckbox),
            matching: find.byType(DecoratedBox),
          ),
        ),
        const Size.square(22),
      );
      expect(
        tester.getSize(find.byType(NitumeCheckbox)).height,
        greaterThanOrEqualTo(48),
      );

      await tester.tap(find.text('Set as default'));
      await tester.pump();
      expect(value, isTrue);
      box = boxOf(tester);
      expect(box.color, NitumeColors.green);
      expect(
        tester.widget<Icon>(find.byIcon(Icons.check_rounded)).color,
        NitumeColors.white,
      );
      expect(
        tester.widget<Text>(find.text('Set as default')).style?.fontSize,
        13.5,
      );
    });

    testWidgets('disabled ignores taps', (tester) async {
      await pumpThemed(
        tester,
        const NitumeCheckbox(
          value: true,
          label: 'Set as default',
          onChanged: null,
        ),
      );
      await tester.tap(find.text('Set as default'));
      expect(boxOf(tester).color, NitumeColors.green);
    });
  });
}
