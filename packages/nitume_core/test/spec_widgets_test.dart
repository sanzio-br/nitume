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
}
