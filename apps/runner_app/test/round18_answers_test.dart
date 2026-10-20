import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/active/evidence_capture_screen.dart';
import 'package:runner_app/src/screens/jobs/job_detail_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/shell_controller.dart';
import 'package:runner_app/src/util/display.dart';

import 'support/fakes.dart';

/// Owner rows 248 (difference awaiting payment), 252 (evidence too large)
/// and 254 (receipts while DISPUTED), round 18.

Future<void> _pumpActive(WidgetTester t, TestBackend b) async {
  b.services.shell.select(RunnerTab.active);
  await b.pumpScreen(t, const RunnerShell());
}

const _awaiting = DifferenceAwaitingPayment(
  amount: '1000.00',
  priceChangeRequestIds: ['p1'],
);

RunnerJobView _buyJob({
  ErrandStatus status = ErrandStatus.inProgress,
  DifferenceAwaitingPayment? difference = _awaiting,
  String requiredPurchase = '5000.00',
}) => heldJob(
  status: status,
  category: ErrandCategory.buyForMe,
  title: 'Buy a gas refill',
  itemAmount: '6000.00',
  merchantRoute: MerchantRoute.sendToRunner,
  requiredPurchase: requiredPurchase,
  differenceAwaitingPayment: difference,
);

const _approved = PriceChangeDecided(
  errandId: 'e1',
  requestId: 'p1',
  fromPrice: '5000.00',
  toPrice: '6000.00',
  status: PriceChangeStatus.approved,
  outcome: PriceDecisionOutcome.approved,
);

void main() {
  group('row 248: difference awaiting payment', () {
    testWidgets('v-active: the approved wording, no "approved" line', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.heldList = [_buyJob()];
      await _pumpActive(t, b);
      await b.services.live.start();
      b.realtime.decided.add(_approved);
      await t.pumpAndSettle();

      expect(
        find.text('Approved. Waiting for the customer to pay the difference.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Price change approved', findRichText: true),
        findsNothing,
      );
    });

    testWidgets('difference_paid reloads the job; the notice goes', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [_buyJob()];
      await _pumpActive(t, b);
      await b.services.live.start();
      b.realtime.decided.add(_approved);
      await t.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('difference-awaiting-payment')),
        findsOneWidget,
      );

      // The customer paid: the API raises the buy limit, clears the flag.
      b.jobs.heldList = [
        _buyJob(difference: null, requiredPurchase: '6000.00'),
      ];
      final before = b.jobs.heldCalls;
      b.realtime.differencePaid.add(
        const PriceDifferencePaid(
          errandId: 'e1',
          requestId: 'p1',
          amount: '1000.00',
        ),
      );
      await t.pumpAndSettle();
      expect(b.jobs.heldCalls, greaterThan(before));
      expect(
        find.byKey(const ValueKey('difference-awaiting-payment')),
        findsNothing,
      );
      expect(
        find.text(
          'Price change approved. New item amount KSh 6,000.',
          findRichText: true,
        ),
        findsOneWidget,
      );
    });

    test('a payment event for a job not held is ignored', () async {
      final b = TestBackend();
      b.jobs.heldList = [_buyJob()];
      await b.services.active.load();
      await b.services.live.start();
      final before = b.jobs.heldCalls;
      b.realtime.differencePaid.add(
        const PriceDifferencePaid(
          errandId: 'other',
          requestId: 'p9',
          amount: '10.00',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(b.jobs.heldCalls, before);
    });

    test('amount to spend is requiredPurchase on send_to_runner', () {
      expect(amountToSpend(_buyJob()), '5000.00');
      expect(
        amountToSpend(
          heldJob(
            itemAmount: '800.00',
            merchantRoute: MerchantRoute.merchantDirect,
          ),
        ),
        '800.00',
      );
    });

    testWidgets('v-job-detail shows the buy limit, not the raised price', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(
          category: ErrandCategory.buyForMe,
          itemAmount: '6000.00',
          merchantRoute: MerchantRoute.sendToRunner,
          requiredPurchase: '5000.00',
          differenceAwaitingPayment: _awaiting,
        ),
      ];
      await b.pumpScreen(t, const RunnerShell());
      await t.tap(find.text('Check apartment — Nyali').first);
      await t.pumpAndSettle();
      expect(find.byType(JobDetailScreen), findsOneWidget);
      expect(find.bySemanticsLabel('Item amount, KSh 5,000'), findsOneWidget);
      expect(find.textContaining('6,000'), findsNothing);
    });
  });

  group('row 252: too large in the offline queue', () {
    testWidgets('a dropped too-large photo: its own notice, size in Fira '
        'Code', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(status: ErrandStatus.inProgress)];
      await _pumpActive(t, b);
      final action = await b.services.queue.enqueue(
        QueuedActionKind.evidenceUpload,
        errandId: 'e1',
        payload: RunnerQueuedActions.evidence(
          path: 'kept/big.jpg',
          type: EvidenceType.photo,
          contentType: 'image/jpeg',
        ),
      );
      b.services.active.onQueueDropped(action, QueueDropReason.tooLarge);
      await t.pumpAndSettle();

      final message = RunnerEvidenceCopy.tooLarge(
        EvidenceTooLarge.defaultMaxBytes,
      );
      expect(message, 'This photo is larger than 10 MB. Take it again.');
      final notice = t.widget<NitumeNotice>(
        find.widgetWithText(NitumeNotice, message),
      );
      expect(notice.tone, NitumeNoticeTone.danger);
      final spans = <InlineSpan>[];
      notice.richMessage!.visitChildren((s) {
        spans.add(s);
        return true;
      });
      expect(
        spans
            .whereType<TextSpan>()
            .firstWhere((s) => s.text == '10 MB')
            .style
            ?.fontFamily,
        NitumeTypography.numericFamily,
      );
      expect(
        find.text("A photo couldn't be added to the job. Take it again."),
        findsNothing,
      );
    });
  });

  group('row 254: receipts while DISPUTED', () {
    testWidgets('receipt Upload enabled, photos refused', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [
        _buyJob(status: ErrandStatus.disputed, difference: null),
      ];
      await _pumpActive(t, b);

      final photos = t.widget<ChecklistStepCard>(
        find.byKey(const ValueKey('step-photos')),
      );
      expect(photos.onAction, isNull);
      final receipt = t.widget<ChecklistStepCard>(
        find.byKey(const ValueKey('step-receipt')),
      );
      expect(receipt.onAction, isNotNull);

      receipt.onAction!();
      await t.pumpAndSettle();
      final screen = t.widget<EvidenceCaptureScreen>(
        find.byType(EvidenceCaptureScreen),
      );
      expect(screen.type, EvidenceType.receipt);
      expect(find.text(EvidenceCopy.notAllowed), findsNothing);
    });
  });
}
