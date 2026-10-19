import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

/// R-23 `DeclineReasonDialog` (row 210, `v-jobs.md` "Decline reason picker").
void main() {
  late List<OfferDeclineReason?> sent;
  late DeclineReasonOutcome? outcome;

  setUp(() {
    sent = [];
    outcome = null;
  });

  Future<void> open(
    WidgetTester tester, {
    bool overPurchaseLimit = false,
    bool reasonRequired = true,
    Future<void> Function(OfferDeclineReason?)? onDecline,
  }) async {
    await pumpThemed(
      tester,
      Builder(
        builder: (context) => Center(
          child: NitumeButton.primary(
            label: 'Open',
            onPressed: () async {
              outcome = await DeclineReasonDialog.show(
                context,
                overPurchaseLimit: overPurchaseLimit,
                reasonRequired: reasonRequired,
                onDecline:
                    onDecline ??
                    (r) async {
                      sent.add(r);
                    },
              );
            },
          ),
        ),
      ),
      surfaceSize: const Size(420, 900),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  Finder row(OfferDeclineReason r) =>
      find.byKey(ValueKey('decline-reason-${r.wire}'));

  Finder declineButton() => find.widgetWithText(NitumeButton, 'Decline');

  bool declineEnabled(WidgetTester tester) =>
      tester.widget<NitumeButton>(declineButton()).onPressed != null;

  NitumeApiException apiError(int status, [String? code]) =>
      NitumeApiException(message: 'x', statusCode: status, code: code);

  test('copy lives in one place', () {
    expect(
      DeclineReasonCopy.reason(OfferDeclineReason.overPurchaseLimit),
      'Above my purchase limit',
    );
    expect(DeclineReasonCopy.reason(OfferDeclineReason.tooFar), 'Too far away');
    expect(
      DeclineReasonCopy.reason(OfferDeclineReason.notAvailable),
      'Not available right now',
    );
    expect(DeclineReasonCopy.reason(OfferDeclineReason.other), 'Other reason');
  });

  testWidgets('within the limit: three reasons, none selected, Decline off', (
    tester,
  ) async {
    await open(tester);
    expect(find.text(DeclineReasonCopy.title), findsOneWidget);
    expect(find.text(DeclineReasonCopy.body), findsOneWidget);
    // C-35 body style: 13.5 slate-600.
    final body = tester.widget<Text>(find.text(DeclineReasonCopy.body));
    expect(body.style?.fontSize, 13.5);
    expect(body.style?.color, NitumeColors.slate600);
    expect(find.text(DeclineReasonCopy.reasonsLabel), findsOneWidget);
    expect(row(OfferDeclineReason.overPurchaseLimit), findsNothing);
    for (final r in [
      OfferDeclineReason.tooFar,
      OfferDeclineReason.notAvailable,
      OfferDeclineReason.other,
    ]) {
      expect(row(r), findsOneWidget);
      expect(tester.widget<NitumeRadioRow>(row(r)).selected, isFalse);
    }
    expect(declineEnabled(tester), isFalse);
    expect(
      tester.getSemantics(declineButton()),
      matchesSemantics(
        hint: DeclineReasonCopy.chooseReasonFirst,
        label: 'Decline',
        isButton: true,
        hasEnabledState: true,
      ),
    );

    // Decline is the outline variant, never red.
    final decline = tester.widget<NitumeButton>(declineButton());
    expect(decline.variant, NitumeButtonVariant.outline);
    expect(decline.destructive, isFalse);
    expect(
      tester
          .widget<NitumeButton>(find.widgetWithText(NitumeButton, 'Keep offer'))
          .variant,
      NitumeButtonVariant.primary,
    );
  });

  testWidgets('picking a reason enables Decline and sends it', (tester) async {
    await open(tester);
    await tester.tap(row(OfferDeclineReason.tooFar));
    await tester.pump();
    expect(
      tester.widget<NitumeRadioRow>(row(OfferDeclineReason.tooFar)).selected,
      isTrue,
    );
    expect(declineEnabled(tester), isTrue);

    await tester.tap(row(OfferDeclineReason.other));
    await tester.pump();
    expect(
      tester.widget<NitumeRadioRow>(row(OfferDeclineReason.tooFar)).selected,
      isFalse,
    );

    await tester.tap(declineButton());
    await tester.pumpAndSettle();
    expect(sent, [OfferDeclineReason.other]);
    expect(outcome, DeclineReasonOutcome.declined);
    expect(find.byType(DeclineReasonDialog), findsNothing);
  });

  testWidgets('selected row: blue fill, white label', (tester) async {
    await open(tester);
    await tester.tap(row(OfferDeclineReason.notAvailable));
    await tester.pumpAndSettle();
    final box = tester.widget<AnimatedContainer>(
      find.descendant(
        of: row(OfferDeclineReason.notAvailable),
        matching: find.byType(AnimatedContainer),
      ),
    );
    expect((box.decoration! as BoxDecoration).color, NitumeColors.blue);
    final label = tester.widget<Text>(
      find.descendant(
        of: row(OfferDeclineReason.notAvailable),
        matching: find.text('Not available right now'),
      ),
    );
    expect(label.style?.color, NitumeColors.white);
  });

  testWidgets('over the limit: listed first, pre-selected, over-limit body', (
    tester,
  ) async {
    await open(tester, overPurchaseLimit: true);
    expect(find.text(DeclineReasonCopy.bodyOverLimit), findsOneWidget);
    final rows = tester.widgetList<NitumeRadioRow>(find.byType(NitumeRadioRow));
    expect(rows.first.label, 'Above my purchase limit');
    expect(rows.first.selected, isTrue);
    expect(rows.length, 4);
    expect(declineEnabled(tester), isTrue);

    await tester.tap(declineButton());
    await tester.pumpAndSettle();
    expect(sent, [OfferDeclineReason.overPurchaseLimit]);
  });

  testWidgets('Keep offer resolves kept and sends nothing', (tester) async {
    await open(tester);
    await tester.tap(find.text('Keep offer'));
    await tester.pumpAndSettle();
    expect(outcome, DeclineReasonOutcome.kept);
    expect(sent, isEmpty);
  });

  testWidgets('reasonRequired false allows a general decline', (tester) async {
    await open(tester, reasonRequired: false);
    expect(declineEnabled(tester), isTrue);
    await tester.tap(declineButton());
    await tester.pumpAndSettle();
    expect(sent, [null]);
    expect(outcome, DeclineReasonOutcome.declined);
  });

  testWidgets('purchase_within_limit drops the over-limit row, stays open', (
    tester,
  ) async {
    await open(
      tester,
      overPurchaseLimit: true,
      onDecline: (r) async {
        sent.add(r);
        if (r == OfferDeclineReason.overPurchaseLimit) {
          throw apiError(409, ApiErrorCodes.purchaseWithinLimit);
        }
      },
    );
    await tester.tap(declineButton());
    await tester.pumpAndSettle();
    expect(find.byType(DeclineReasonDialog), findsOneWidget);
    expect(find.text(DeclineReasonCopy.errorWithinLimit), findsOneWidget);
    expect(row(OfferDeclineReason.overPurchaseLimit), findsNothing);
    expect(declineEnabled(tester), isFalse);

    await tester.tap(row(OfferDeclineReason.tooFar));
    await tester.pump();
    expect(find.text(DeclineReasonCopy.errorWithinLimit), findsNothing);
    await tester.tap(declineButton());
    await tester.pumpAndSettle();
    expect(sent, [
      OfferDeclineReason.overPurchaseLimit,
      OfferDeclineReason.tooFar,
    ]);
    expect(outcome, DeclineReasonOutcome.declined);
  });

  for (final (name, error) in [
    (
      'offer_expired',
      NitumeApiException(
        message: 'x',
        statusCode: 409,
        code: ApiErrorCodes.offerExpired,
      ),
    ),
    ('404', const NitumeApiException(message: 'x', statusCode: 404)),
  ]) {
    testWidgets('$name closes with offerUnavailable', (tester) async {
      await open(tester, onDecline: (_) async => throw error);
      await tester.tap(row(OfferDeclineReason.other));
      await tester.pump();
      await tester.tap(declineButton());
      await tester.pumpAndSettle();
      expect(find.byType(DeclineReasonDialog), findsNothing);
      expect(outcome, DeclineReasonOutcome.offerUnavailable);
    });
  }

  for (final (name, error, message) in [
    (
      'decline_reason_invalid',
      NitumeApiException(
        message: 'x',
        statusCode: 400,
        code: ApiErrorCodes.declineReasonInvalid,
      ),
      DeclineReasonCopy.errorReasonInvalid,
    ),
    (
      'other API error',
      const NitumeApiException(message: 'x', statusCode: 500),
      DeclineReasonCopy.errorGeneric,
    ),
    ('non-API error', StateError('boom'), DeclineReasonCopy.errorGeneric),
  ]) {
    testWidgets('$name shows an inline error and stays open', (tester) async {
      await open(tester, onDecline: (_) async => throw error);
      await tester.tap(row(OfferDeclineReason.tooFar));
      await tester.pump();
      await tester.tap(declineButton());
      await tester.pumpAndSettle();
      expect(find.byType(DeclineReasonDialog), findsOneWidget);
      expect(find.text(message), findsOneWidget);
      expect(declineEnabled(tester), isTrue);
    });
  }

  testWidgets('while sending: buttons off, back does not close', (
    tester,
  ) async {
    final pending = Completer<void>();
    await open(tester, onDecline: (_) => pending.future);
    await tester.tap(row(OfferDeclineReason.tooFar));
    await tester.pump();
    await tester.tap(declineButton());
    await tester.pump();
    expect(
      tester
          .widget<NitumeButton>(find.widgetWithText(NitumeButton, 'Keep offer'))
          .onPressed,
      isNull,
    );
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(DeclineReasonDialog), findsOneWidget);

    pending.complete();
    await tester.pumpAndSettle();
    expect(outcome, DeclineReasonOutcome.declined);
  });
}
