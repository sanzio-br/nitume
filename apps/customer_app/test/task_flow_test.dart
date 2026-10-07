import 'package:customer_app/src/screens/checkout/price_change_dialog.dart';
import 'package:customer_app/src/screens/task/evidence_confirm_screen.dart';
import 'package:customer_app/src/screens/task/rate_screen.dart';
import 'package:customer_app/src/screens/task/report_problem_screen.dart';
import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:customer_app/src/screens/shell/track_tab.dart';
import 'package:customer_app/src/services/shell_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

/// A screen with one button that opens the price-change modal.
class _Host extends StatelessWidget {
  const _Host({required this.errand, this.onOutcome});

  final Errand errand;
  final ValueChanged<PriceChangeOutcome>? onOutcome;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: TextButton(
        onPressed: () async {
          final o = await showPriceChangeDialog(context, errand: errand);
          onOutcome?.call(o);
        },
        child: const Text('open'),
      ),
    ),
  );
}

Evidence photo(String id) => Evidence(
  id: id,
  errandId: 'e1',
  type: EvidenceType.photo,
  capturedAt: DateTime(2026, 10, 7, 10, 41),
);

void main() {
  group('v-price-auth', () {
    testWidgets('blocking modal: approve', (t) async {
      final b = TestBackend();
      b.priceChanges.pendingValue = priceChange();
      PriceChangeOutcome? outcome;
      await b.pumpScreen(
        t,
        _Host(errand: errand(), onOutcome: (o) => outcome = o),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();

      expect(find.text('Price change'), findsOneWidget);
      expect(
        find.text(
          'Brian K. found the item priced higher than quoted. Approve the '
          'difference to continue?',
        ),
        findsOneWidget,
      );
      expect(find.text('40,000'), findsOneWidget);
      expect(find.text('45,000'), findsOneWidget);
      expect(find.text('+ KSh 5,000 additional'), findsOneWidget);

      // The scrim does not close it.
      await t.tapAt(const Offset(5, 5));
      await t.pumpAndSettle();
      expect(find.text('Price change'), findsOneWidget);

      await t.tap(find.text('Approve KSh 5,000 increase'));
      await t.pumpAndSettle();
      expect(b.priceChanges.approved, ['pc1']);
      expect(outcome, PriceChangeOutcome.approved);
      expect(find.text('Price change approved.'), findsOneWidget);
    });

    testWidgets('reject asks again, then cancels via reject', (t) async {
      final b = TestBackend();
      b.priceChanges.pendingValue = priceChange();
      PriceChangeOutcome? outcome;
      await b.pumpScreen(
        t,
        _Host(errand: errand(), onOutcome: (o) => outcome = o),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await t.tap(find.text('Reject & cancel task'));
      await t.pumpAndSettle();
      expect(find.text('Reject and cancel this task?'), findsOneWidget);
      await t.tap(find.text('Go back'));
      await t.pumpAndSettle();
      expect(b.priceChanges.rejected, isEmpty);

      await t.tap(find.text('Reject & cancel task'));
      await t.pumpAndSettle();
      await t.tap(find.text('Reject & cancel'));
      await t.pumpAndSettle();
      expect(b.priceChanges.rejected, ['pc1']);
      expect(outcome, PriceChangeOutcome.rejected);
      expect(find.text('Price change'), findsNothing);
    });

    testWidgets('route required: customer must choose before approve', (
      t,
    ) async {
      final b = TestBackend();
      b.priceChanges.pendingValue = priceChange();
      b.priceChanges.requireRoute = true;
      await b.pumpScreen(t, _Host(errand: errand()));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await t.tap(find.text('Approve KSh 5,000 increase'));
      await t.pumpAndSettle();

      expect(b.priceChanges.approved, isEmpty);
      expect(find.text('Send purchase amount to runner'), findsOneWidget);
      final approve = find.widgetWithText(
        NitumeButton,
        'Approve KSh 5,000 increase',
      );
      expect(t.widget<NitumeButton>(approve).onPressed, isNull);
      final direct = t.widget<NitumeRadioRow>(
        find.widgetWithText(
          NitumeRadioRow,
          'Pay merchant directly (recommended)',
        ),
      );
      expect(direct.onSelected, isNull);

      await t.tap(find.text('Send purchase amount to runner'));
      await t.pumpAndSettle();
      await t.tap(approve);
      await t.pumpAndSettle();
      expect(b.priceChanges.approvedRoutes, [MerchantRoute.sendToRunner]);
    });

    testWidgets('load failure offers a retry', (t) async {
      final b = TestBackend();
      b.priceChanges.pendingError = const NitumeApiException(message: 'x');
      await b.pumpScreen(t, _Host(errand: errand()));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(find.text("Couldn't load this price change."), findsOneWidget);
      b.priceChanges.pendingError = null;
      b.priceChanges.pendingValue = priceChange();
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(find.text('+ KSh 5,000 additional'), findsOneWidget);
    });

    for (final action in ['Approve KSh 5,000 increase', 'reject']) {
      testWidgets('409 price_change_already_decided on $action', (t) async {
        final b = TestBackend();
        b.priceChanges.pendingValue = priceChange();
        b.priceChanges.decisionError = const NitumeApiException(
          message: 'decided',
          statusCode: 409,
          code: 'price_change_already_decided',
        );
        PriceChangeOutcome? outcome;
        await b.pumpScreen(
          t,
          _Host(errand: errand(), onOutcome: (o) => outcome = o),
        );
        await t.tap(find.text('open'));
        await t.pumpAndSettle();
        if (action == 'reject') {
          await t.tap(find.text('Reject & cancel task'));
          await t.pumpAndSettle();
          await t.tap(find.text('Reject & cancel'));
        } else {
          await t.tap(find.text(action));
        }
        await t.pumpAndSettle();
        expect(
          find.text('This price change was already answered.'),
          findsOneWidget,
        );
        await t.tap(find.text('OK'));
        await t.pumpAndSettle();
        expect(outcome, PriceChangeOutcome.dismissed);
        expect(find.text('Price change'), findsNothing);
      });
    }

    testWidgets('already answered', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, _Host(errand: errand()));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(
        find.text('This price change was already answered.'),
        findsOneWidget,
      );
      await t.tap(find.text('OK'));
      await t.pumpAndSettle();
      expect(find.text('Price change'), findsNothing);
    });
  });

  group('v-track', () {
    testWidgets('runner card, timeline and price-change action', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      b.errands.historyValue = [
        StatusHistoryEntry(
          id: 'h1',
          errandId: 'e1',
          toStatus: ErrandStatus.runnerAssigned,
          actorType: StatusHistoryActor.system,
          createdAt: DateTime(2026, 10, 7, 10, 3),
        ),
        StatusHistoryEntry(
          id: 'h2',
          errandId: 'e1',
          toStatus: ErrandStatus.runnerEnRoute,
          actorType: StatusHistoryActor.runner,
          createdAt: DateTime(2026, 10, 7, 10, 12),
        ),
      ];
      b.priceChanges.pendingValue = priceChange();
      await b.pumpApp(t);
      await t.tap(find.text('Track'));
      await t.pumpAndSettle();

      expect(find.text('Track task'), findsOneWidget);
      expect(find.text('Brian K.'), findsOneWidget);
      expect(find.text('Verified · 4.9'), findsOneWidget);
      expect(find.text('En route'), findsWidgets);
      expect(find.text('Runner assigned'), findsOneWidget);
      expect(find.text('Arrived'), findsOneWidget); // next expected
      expect(
        find.text('Live location appears when your runner is on the way.'),
        findsOneWidget,
      );
      expect(find.text('Review evidence'), findsNothing);

      await t.tap(find.text('Price change').first);
      await t.pumpAndSettle();
      expect(find.text('Approve KSh 5,000 increase'), findsOneWidget);
    });

    testWidgets('empty state starts a task', (t) async {
      final b = TestBackend();
      await b.pumpApp(t);
      await t.tap(find.text('Track'));
      await t.pumpAndSettle();
      expect(find.text('No task in progress.'), findsOneWidget);
      await t.tap(find.text('Start a new task'));
      await t.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsOneWidget);
    });
  });

  test('timeline never shows CONFIRMED or SETTLED (row 35)', () {
    final steps = timelineSteps(
      [
        _h('h1', ErrandStatus.draft, 1),
        _h('h2', ErrandStatus.awaitingCustomer, 2),
        _h('h3', ErrandStatus.completed, 3),
        _h('h4', ErrandStatus.confirmed, 4),
        _h('h5', ErrandStatus.settled, 5),
      ],
      const [],
      ErrandStatus.settled,
    );
    expect(steps.map((s) => s.title), ['Needs your review', 'Completed']);
  });

  group('v-task-detail', () {
    testWidgets('completed: rate, receipt, report row', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      b.payments.summary = PaymentSummary(
        payment: payment(
          merchantAmount: '40000.00',
          flow: PaymentFlow.customerToRunner,
        ),
      );
      b.evidence.items = [photo('ev1')];
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));

      expect(find.text('Completed'), findsOneWidget);
      expect(find.text('#NT-10482 · 7 Oct, 10:03 AM'), findsNothing);
      expect(find.text('Rate this task'), findsOneWidget);
      expect(find.text('Verified · 4.9 · 137 tasks'), findsOneWidget);
      expect(find.text('KSh 700'), findsOneWidget);
      expect(find.text('KSh 1,500'), findsOneWidget);
      expect(find.text('KSh 2,200'), findsOneWidget);
      expect(find.text('KSh 40,000'), findsOneWidget);
      expect(find.text('Sent to your runner'), findsOneWidget);
      expect(find.text('Report a problem with this task'), findsOneWidget);
    });

    testWidgets('not paid yet before payment', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.quoted, withRunner: false));
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      expect(find.text('Review quote'), findsOneWidget);
      expect(find.text('Not paid yet.'), findsOneWidget);
      expect(find.text('Report a problem with this task'), findsNothing);
    });
  });

  group('v-evidence-confirm', () {
    testWidgets('confirm completion → COMPLETED → rate', (t) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: ErrandStatus.awaitingCustomer,
          runnerNotes: 'Water leak reported to the landlord.',
        ),
      );
      b.evidence.items = [photo('ev1'), photo('ev2')];
      b.payments.summary = PaymentSummary(payment: payment());
      await b.pumpScreen(t, const EvidenceConfirmScreen(errandId: 'e1'));

      expect(find.text('PHOTOS & VIDEO (2)'), findsOneWidget);
      expect(
        find.text('"Water leak reported to the landlord."'),
        findsOneWidget,
      );
      expect(find.textContaining('release'), findsNothing);
      await t.tap(find.text('Confirm completion'));
      await t.pumpAndSettle();
      expect(b.errands.transitions.single, ('e1', ErrandStatus.completed));
      expect(find.text('Rate this task'), findsOneWidget);
      expect(find.text('How was Brian K.?'), findsOneWidget);
    });

    testWidgets('no evidence yet disables confirm', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.awaitingCustomer));
      await b.pumpScreen(t, const EvidenceConfirmScreen(errandId: 'e1'));
      expect(
        find.text("The runner hasn't uploaded evidence yet."),
        findsOneWidget,
      );
      final cta = t.widget<NitumeButton>(
        find.widgetWithText(NitumeButton, 'Confirm completion'),
      );
      expect(cta.onPressed, isNull);
    });
  });

  group('x-report-problem', () {
    testWidgets('validates and opens a dispute', (t) async {
      final b = TestBackend();
      await b.pumpScreen(
        t,
        ReportProblemScreen.write(
          errand: errand(status: ErrandStatus.completed),
        ),
      );
      await t.tap(find.text('Send report'));
      await t.pumpAndSettle();
      expect(
        find.text('Tell us a bit more (at least 5 characters).'),
        findsOneWidget,
      );
      await t.enterText(find.byType(TextField), 'Wrong item delivered');
      await t.pumpAndSettle();
      expect(find.text('20/500'), findsOneWidget);
      await t.tap(find.text('Send report'));
      await t.pumpAndSettle();
      expect(b.disputes.opened.single, ('e1', 'Wrong item delivered'));
    });

    testWidgets('read mode shows the status', (t) async {
      final b = TestBackend();
      b.disputes.existing = Dispute(
        id: 'd1',
        errandId: 'e1',
        openedBy: 'u1',
        reason: 'Wrong item delivered',
        status: DisputeStatus.underReview,
        createdAt: DateTime(2026, 10, 7, 10, 41),
      );
      await b.pumpScreen(
        t,
        ReportProblemScreen.read(errand: errand(status: ErrandStatus.disputed)),
      );
      expect(find.text('Under review'), findsOneWidget);
      expect(find.text('Wrong item delivered'), findsOneWidget);
    });
  });

  group('v-rate', () {
    testWidgets('submit needs a star, then goes home', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      await b.pumpScreen(t, const RateScreen(errandId: 'e1'));
      final cta = find.widgetWithText(NitumeButton, 'Submit rating');
      expect(t.widget<NitumeButton>(cta).onPressed, isNull);
      await t.tap(find.byKey(const ValueKey('star-4')));
      await t.pumpAndSettle();
      await t.tap(find.text('Submit rating'));
      await t.pump();
      await t.pump();
      expect(b.ratings.rated.single.$1, 'e1');
      expect(b.services.shell.tab, ShellTab.home);
    });
  });
}

StatusHistoryEntry _h(String id, ErrandStatus to, int minute) =>
    StatusHistoryEntry(
      id: id,
      errandId: 'e1',
      toStatus: to,
      actorType: StatusHistoryActor.system,
      createdAt: DateTime(2026, 10, 7, 10, minute),
    );
