import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/active/claim_screen.dart';
import 'package:runner_app/src/screens/active/job_summary_screen.dart';

import 'support/fakes.dart';

Future<TestBackend> _withJob(RunnerJobView job) async {
  final b = TestBackend();
  b.jobs.heldList = [job];
  b.jobs.jobs[job.id] = job;
  await b.services.active.load();
  return b;
}

void main() {
  group('v-job-summary', () {
    testWidgets('awaiting: success mark, runner fee, payable line', (t) async {
      final b = await _withJob(heldJob(status: ErrandStatus.awaitingCustomer));
      await b.pumpScreen(t, const JobSummaryScreen(errandId: 'e1'));
      expect(find.text('Job complete'), findsOneWidget);
      expect(find.byType(SuccessMark), findsOneWidget);
      expect(find.text('Nice work.'), findsOneWidget);
      expect(
        find.text('Check apartment — Nyali · awaiting customer confirmation'),
        findsOneWidget,
      );
      expect(find.text('Runner fee'), findsOneWidget);
      expect(find.text("You'll earn"), findsOneWidget);
      expect(
        find.text(
          'Payable after the customer confirms and the review window closes.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('purchase task without receipt: reimbursement on hold', (
      t,
    ) async {
      final b = await _withJob(
        heldJob(
          status: ErrandStatus.awaitingCustomer,
          category: ErrandCategory.buyForMe,
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
        ),
      );
      await b.pumpScreen(t, const JobSummaryScreen(errandId: 'e1'));
      expect(find.text('Item reimbursement'), findsOneWidget);
      expect(find.text('On hold'), findsOneWidget);
    });

    testWidgets('cancelled purchase: no mark, claim item spend', (t) async {
      final b = await _withJob(
        heldJob(
          status: ErrandStatus.cancelled,
          category: ErrandCategory.buyForMe,
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
        ),
      );
      b.jobs.historyById['e1'] = [
        historyEntry('e1', ErrandStatus.cancelled, at: testNow),
      ];
      b.jobs.evidenceById['e1'] = [
        evidenceItem('e1', id: 'r1', type: EvidenceType.receipt),
      ];
      await b.pumpScreen(t, const JobSummaryScreen(errandId: 'e1'));
      expect(find.byType(SuccessMark), findsNothing);
      expect(find.text('Cancelled'), findsOneWidget);
      expect(find.text('Job ended'), findsOneWidget);
      expect(find.textContaining('Nice work'), findsNothing);
      await t.tap(find.text('Claim item spend'));
      await t.pumpAndSettle();
      expect(find.byType(ClaimScreen), findsOneWidget);
      expect(find.text('Up to KSh 3,000.', findRichText: true), findsOneWidget);

      await t.enterText(find.byType(TextField).first, '4000');
      await t.tap(find.text('Send claim'));
      await t.pumpAndSettle();
      expect(find.text('You can claim up to KSh 3,000.'), findsOneWidget);
      expect(b.payouts.claims, isEmpty);

      await t.enterText(find.byType(TextField).first, '2500');
      await t.tap(find.text('Send claim'));
      await t.pumpAndSettle();
      expect(b.payouts.claims.single, ('e1', 2500, 'r1', null));
      expect(find.text(SummaryCopy.claimSent), findsOneWidget);
    });

    testWidgets('claim form: untimed receipt by number, note 0/500', (t) async {
      final b = await _withJob(
        heldJob(
          status: ErrandStatus.failed,
          category: ErrandCategory.buyForMe,
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
        ),
      );
      b.jobs.evidenceById['e1'] = [
        evidenceItem(
          'e1',
          id: '7f1c-uuid',
          type: EvidenceType.receipt,
          timed: false,
        ),
      ];
      await b.pumpScreen(t, const ClaimScreen(errandId: 'e1'));
      expect(find.text('Receipt 1', findRichText: true), findsOneWidget);
      final label = t
          .widget<NitumeRadioRow>(find.byType(NitumeRadioRow))
          .richLabel!;
      final numbers = <String>[];
      label.visitChildren((span) {
        if (span is NumSpan) numbers.add(span.text!);
        return true;
      });
      expect(numbers, ['1']);
      expect(find.textContaining('7f1c-uuid'), findsNothing);
      expect(find.text('0/500'), findsOneWidget);
      await t.enterText(find.byType(TextField).last, 'x' * 600);
      await t.pumpAndSettle();
      expect(find.text('500/500'), findsOneWidget);
    });
  });
}
