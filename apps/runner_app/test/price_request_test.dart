import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/active/price_request_screen.dart';

import 'support/fakes.dart';

Future<TestBackend> _withJob(RunnerJobView job) async {
  final b = TestBackend();
  b.jobs.heldList = [job];
  b.jobs.jobs[job.id] = job;
  await b.services.active.load();
  return b;
}

void main() {
  group('v-price-request', () {
    RunnerJobView job({MerchantRoute route = MerchantRoute.sendToRunner}) =>
        heldJob(
          status: ErrandStatus.inProgress,
          category: ErrandCategory.buyForMe,
          itemAmount: '40000.00',
          merchantRoute: route,
        );

    testWidgets('validation, difference, limit note, confirm and send', (
      t,
    ) async {
      final b = await _withJob(job());
      await b.pumpScreen(t, const PriceRequestScreen(errandId: 'e1'));
      expect(find.text('Request price change'), findsOneWidget);
      expect(find.text('KSh 40,000'), findsOneWidget);

      await t.enterText(
        find.byType(TextField).last,
        'Only the newer model is in stock.',
      );
      await t.enterText(find.byType(TextField).first, '45000');
      await t.pumpAndSettle();
      expect(
        find.text(
          'The customer will be asked to approve KSh 5,000 more.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          "This is above your purchase limit of KSh 3,000. You'll be "
          'reimbursed up to KSh 3,000 unless our team approves more.',
          findRichText: true,
        ),
        findsOneWidget,
      );

      await t.tap(find.text('Send to customer for approval'));
      await t.pumpAndSettle();
      expect(find.text('Send this price change?'), findsOneWidget);
      await t.tap(find.text('Send'));
      await t.pumpAndSettle();
      expect(b.jobs.priceRequests.single.$2, 45000);
    });

    testWidgets('empty form: both validation messages', (t) async {
      final b = await _withJob(job());
      await b.pumpScreen(t, const PriceRequestScreen(errandId: 'e1'));
      await t.tap(find.text('Send to customer for approval'));
      await t.pumpAndSettle();
      expect(find.text(PriceCopy.priceInvalid), findsOneWidget);
      expect(find.text(PriceCopy.reasonInvalid), findsOneWidget);
      expect(b.jobs.priceRequests, isEmpty);
    });

    testWidgets('already pending: notice, no form', (t) async {
      final b = await _withJob(job(route: MerchantRoute.merchantDirect));
      b.jobs.pendingById['e1'] = PriceChangeRequest(
        id: 'p1',
        errandId: 'e1',
        requestedByUserId: 'u1',
        fromPrice: '40000.00',
        toPrice: '45000.00',
        status: PriceChangeStatus.requested,
      );
      await b.pumpScreen(t, const PriceRequestScreen(errandId: 'e1'));
      expect(find.text(PriceCopy.alreadyPending), findsOneWidget);
      expect(find.text('Send to customer for approval'), findsNothing);
    });

    testWidgets('refused: one danger notice with the mapped copy', (t) async {
      final b = await _withJob(job(route: MerchantRoute.merchantDirect));
      b.jobs.priceError = apiError(ApiErrorCodes.priceChangeNotInProgress);
      await b.pumpScreen(t, const PriceRequestScreen(errandId: 'e1'));
      await t.enterText(find.byType(TextField).first, '45000');
      await t.enterText(
        find.byType(TextField).last,
        'Out of stock, newer one.',
      );
      await t.tap(find.text('Send to customer for approval'));
      await t.pumpAndSettle();
      await t.tap(find.text('Send'));
      await t.pumpAndSettle();
      final n = t.widget<NitumeNotice>(
        find.widgetWithText(NitumeNotice, PriceCopy.notInProgress),
      );
      expect(n.tone, NitumeNoticeTone.danger);
    });
  });
}
