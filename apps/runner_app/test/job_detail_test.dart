import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/jobs/job_detail_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

Future<void> _pumpJobs(WidgetTester t, TestBackend b) =>
    b.pumpScreen(t, const RunnerShell());

Finder _card(String id) => find.byKey(ValueKey('offer-$id'));

Finder _inCard(String id, String text) =>
    find.descendant(of: _card(id), matching: find.text(text));

void main() {
  group('v-job-detail', () {
    Future<void> openDetail(WidgetTester t, TestBackend b) async {
      await _pumpJobs(t, b);
      await t.tap(_inCard('e1', 'Check apartment — Nyali'));
      await t.pumpAndSettle();
      expect(find.byType(JobDetailScreen), findsOneWidget);
    }

    testWidgets('details, countdown and accept to the Active tab', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(
          offerExpiresAt: testNow.add(const Duration(minutes: 9)),
          deadlineAt: DateTime.utc(2026, 10, 19, 15),
        ),
      ];
      await openDetail(t, b);

      expect(find.text('Job offer'), findsOneWidget);
      expect(
        find.text('Offer ends in 9:00', findRichText: true),
        findsOneWidget,
      );
      expect(
        find.text('Video the compound and both bedrooms.'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Distance, 1.2 km'), findsOneWidget);
      expect(find.bySemanticsLabel('Deadline, Today, 6:00 PM'), findsOneWidget);
      expect(find.bySemanticsLabel('Payout, KSh 1,750'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Task location, Links Rd, Nyali'),
        findsOneWidget,
      );

      await t.tap(find.text('Accept job'));
      await t.pumpAndSettle();
      expect(b.jobs.accepted, ['e1']);
      expect(find.byType(JobDetailScreen), findsNothing);
      expect(b.services.shell.tab, RunnerTab.active);
    });

    testWidgets('purchase rows, limit notice, disabled accept', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
          overPurchaseLimit: true,
        ),
      ];
      await openDetail(t, b);
      expect(find.bySemanticsLabel('Item amount, KSh 5,000'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          "How it's paid, You pay, reimbursed after the customer confirms",
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'This job needs a purchase of KSh 5,000, above your limit of '
          "KSh 3,000. You can decline it. It won't count against you.",
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(find.text('Above your purchase limit'), findsOneWidget);
      expect(
        t
            .widget<NitumeButton>(
              find.widgetWithText(NitumeButton, 'Accept job'),
            )
            .onPressed,
        isNull,
      );
      await t.scrollUntilVisible(
        find.textContaining('Keep the receipt.'),
        200,
        scrollable: find.descendant(
          of: find.byType(JobDetailScreen),
          matching: find.byType(Scrollable),
        ),
      );
      expect(find.textContaining('Keep the receipt.'), findsOneWidget);
    });

    testWidgets('decline returns to v-jobs without the card', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      await openDetail(t, b);
      await t.tap(
        find.descendant(
          of: find.byType(JobDetailScreen),
          matching: find.text('Decline'),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Not available right now'));
      await t.pumpAndSettle();
      await t.tap(
        find.descendant(
          of: find.byType(DeclineReasonDialog),
          matching: find.text('Decline'),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byType(JobDetailScreen), findsNothing);
      expect(b.jobs.declined, [('e1', OfferDeclineReason.notAvailable)]);
      expect(_card('e1'), findsNothing);
    });

    testWidgets('countdown at zero: ended state, Back to jobs', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(offerExpiresAt: testNow.add(const Duration(seconds: 5))),
      ];
      await openDetail(t, b);

      b.now = testNow.add(const Duration(seconds: 6));
      await t.pump(const Duration(seconds: 2));
      await t.pump();
      expect(find.text('This offer is no longer available.'), findsOneWidget);
      expect(find.text('Accept job'), findsNothing);

      await t.tap(find.text('Back to jobs'));
      await t.pumpAndSettle();
      expect(find.byType(JobDetailScreen), findsNothing);
      expect(_card('e1'), findsNothing);
    });

    testWidgets('a withdrawn offer opens in the ended state', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      b.jobs.jobError = apiError(null, status: 403);
      await openDetail(t, b);
      expect(find.text('This offer is no longer available.'), findsOneWidget);
    });

    testWidgets('offline: no buttons, go-online notice', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.offline);
      b.jobs.offerList = [offer()];
      await openDetail(t, b);
      expect(find.text('Go online to accept jobs.'), findsOneWidget);
      expect(find.text('Accept job'), findsNothing);
      expect(
        find.bySemanticsLabel('Distance, Distance unavailable'),
        findsOneWidget,
      );
    });
  });
}
