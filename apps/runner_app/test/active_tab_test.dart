import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/active/evidence_capture_screen.dart';
import 'package:runner_app/src/screens/active/job_summary_screen.dart';
import 'package:runner_app/src/screens/active/notes_editor_screen.dart';
import 'package:runner_app/src/screens/active/price_request_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

Future<void> _pumpActive(WidgetTester t, TestBackend b) async {
  b.services.shell.select(RunnerTab.active);
  await b.pumpScreen(t, const RunnerShell());
}

NitumeButton _button(WidgetTester t, String label) =>
    t.widget(find.widgetWithText(NitumeButton, label).hitTestable());

Future<void> _scrollTo(WidgetTester t, Finder f) async {
  await t.scrollUntilVisible(
    f,
    200,
    scrollable: find
        .descendant(
          of: find.byType(RefreshIndicator).hitTestable(),
          matching: find.byType(Scrollable),
        )
        .first,
  );
}

void main() {
  group('v-active', () {
    testWidgets('no held job: empty state and Go to jobs', (t) async {
      final b = TestBackend();
      await _pumpActive(t, b);
      expect(find.text('Active job'), findsOneWidget);
      expect(find.text('No active job'), findsOneWidget);
      expect(
        find.text('Accept a job from the Jobs tab to start.'),
        findsOneWidget,
      );
      await t.tap(find.text('Go to jobs'));
      await t.pumpAndSettle();
      expect(b.services.shell.tab, RunnerTab.jobs);
    });

    testWidgets("en route: header, nav chip, I've arrived", (t) async {
      final opened = <Uri>[];
      final b = TestBackend(
        appConfig: AppConfig(
          onOpenLink: (u) async {
            opened.add(u);
            return true;
          },
        ),
      );
      b.jobs.heldList = [heldJob(deadlineAt: DateTime.utc(2026, 10, 19, 15))];
      await _pumpActive(t, b);

      expect(find.text('Check apartment — Nyali'), findsOneWidget);
      expect(
        find.text(
          '#NT-e1 · Check It For Me · Due Today, 6:00 PM',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(find.text('On the way'), findsOneWidget);
      expect(find.text('Links Rd, Nyali'), findsOneWidget);
      expect(find.text('1.2 km'), findsOneWidget);
      await t.tap(find.text('Navigate'));
      await t.pumpAndSettle();
      expect(opened.single.toString(), contains('-4.03,39.72'));

      expect(
        find.text("We'll also detect this automatically when you get there."),
        findsOneWidget,
      );
      await _scrollTo(t, find.text("I've arrived"));
      await t.tap(find.text("I've arrived"));
      await t.pumpAndSettle();
      expect(b.jobs.transitions.single.$2, ErrandStatus.arrived);
      expect(find.text('Arrived'), findsWidgets);
      expect(b.services.pings.workingJob, 'e1');
    });

    testWidgets("can't complete: reason required, FAILED with the note", (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob()];
      await _pumpActive(t, b);
      await _scrollTo(t, find.text("Can't complete this task"));
      await t.tap(find.text("Can't complete this task"));
      await t.pumpAndSettle();
      expect(find.text("Can't complete this task?"), findsOneWidget);
      expect(_button(t, 'Mark as failed').onPressed, isNull);
      await t.tap(find.text('Safety concern'));
      await t.pumpAndSettle();
      await t.tap(find.text('Mark as failed'));
      await t.pumpAndSettle();
      expect(b.jobs.transitions.single, (
        'e1',
        ErrandStatus.failed,
        'Safety concern',
      ));
    });

    testWidgets('in progress: missing steps block finishing', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(status: ErrandStatus.inProgress)];
      await _pumpActive(t, b);
      await _scrollTo(t, find.text('Mark task complete'));
      expect(_button(t, 'Mark task complete').onPressed, isNull);
      expect(find.text('Upload photos to finish.'), findsOneWidget);
    });

    testWidgets('in progress complete: confirm, transition, summary', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(status: ErrandStatus.inProgress, runnerNotes: 'All good'),
      ];
      b.jobs.evidenceById['e1'] = [evidenceItem('e1')];
      await _pumpActive(t, b);
      expect(find.text('1 photo uploaded'), findsOneWidget);
      await _scrollTo(t, find.text('Mark task complete'));
      expect(find.text('Customer will confirm evidence'), findsOneWidget);
      await t.tap(find.text('Mark task complete'));
      await t.pumpAndSettle();
      expect(find.text('Finish and send to the customer?'), findsOneWidget);
      await t.tap(find.text('Finish'));
      await t.pumpAndSettle();
      expect(b.jobs.transitions.single.$2, ErrandStatus.awaitingCustomer);
      expect(find.byType(JobSummaryScreen), findsOneWidget);
    });

    testWidgets('checklist Upload opens evidence capture for photos', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(status: ErrandStatus.arrived)];
      await _pumpActive(t, b);
      await t.tap(
        find.descendant(
          of: find.byKey(const ValueKey('step-photos')),
          matching: find.text('Upload'),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byType(EvidenceCaptureScreen), findsOneWidget);
      expect(find.text('Capture evidence'), findsOneWidget);
    });

    testWidgets('notes Add opens the editor; Save stores them', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(status: ErrandStatus.arrived)];
      await _pumpActive(t, b);
      await t.tap(
        find.descendant(
          of: find.byKey(const ValueKey('step-notes')),
          matching: find.text('Add'),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byType(NotesEditorScreen), findsOneWidget);
      expect(find.text('0/2000'), findsOneWidget);
      await t.enterText(find.byType(TextField), 'Gate code 1234');
      await t.pumpAndSettle();
      expect(find.text('14/2000'), findsOneWidget);
      await t.tap(find.text('Save'));
      await t.pumpAndSettle();
      expect(b.jobs.notes.single, ('e1', 'Gate code 1234'));
      expect(find.text('Notes saved.'), findsOneWidget);
      expect(find.text('Gate code 1234'), findsOneWidget);
    });

    testWidgets('a transition refused: one danger notice', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob()];
      b.jobs.transitionErrors.add(apiError(ApiErrorCodes.illegalTransition));
      await _pumpActive(t, b);
      await _scrollTo(t, find.text("I've arrived"));
      await t.tap(find.text("I've arrived"));
      await t.pumpAndSettle();
      final notice = t.widget<NitumeNotice>(
        find.widgetWithText(
          NitumeNotice,
          'This job changed. Showing the latest.',
        ),
      );
      expect(notice.tone, NitumeNoticeTone.danger);
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('offline: queued, target state and offline notice', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob()];
      b.jobs.transitionErrors.add(networkError);
      await _pumpActive(t, b);
      await _scrollTo(t, find.text("I've arrived"));
      await t.tap(find.text("I've arrived"));
      await t.pumpAndSettle();
      expect(
        find.text(
          "Saved on your phone. We'll send it when you're back online.",
        ),
        findsOneWidget,
      );
      expect(find.text('Start task'), findsOneWidget);
    });

    testWidgets('Other jobs lists the AWAITING_CUSTOMER job; tap switches', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(id: 'w1', title: 'Working job'),
        heldJob(
          id: 'a1',
          title: 'Waiting job',
          status: ErrandStatus.awaitingCustomer,
        ),
      ];
      await _pumpActive(t, b);
      expect(find.text('Working job'), findsOneWidget);
      await _scrollTo(t, find.byKey(const ValueKey('other-job-a1')));
      await t.tap(find.byKey(const ValueKey('other-job-a1')));
      await t.pumpAndSettle();
      expect(b.services.shell.focusedJob, 'a1');
      expect(
        find.text("Waiting for the customer to confirm. You'll be notified."),
        findsOneWidget,
      );
      // Job pings stay on the working job.
      expect(b.services.pings.workingJob, 'w1');
    });

    testWidgets(
      'Other jobs lists an ended job while its receipt window is open',
      (t) async {
        final b = TestBackend();
        b.jobs.heldList = [
          heldJob(id: 'w1', title: 'Working job'),
          heldJob(
            id: 'c1',
            title: 'Cancelled purchase',
            status: ErrandStatus.cancelled,
            category: ErrandCategory.buyForMe,
            itemAmount: '5000.00',
            merchantRoute: MerchantRoute.sendToRunner,
          ),
        ];
        b.jobs.historyById['c1'] = [
          historyEntry('c1', ErrandStatus.cancelled, at: testNow),
        ];
        await _pumpActive(t, b);
        expect(find.text('Working job'), findsOneWidget);
        await _scrollTo(t, find.byKey(const ValueKey('other-job-c1')));
        expect(find.byKey(const ValueKey('other-job-c1')), findsOneWidget);

        // Window closed: no longer listed.
        b.now = testNow.add(const Duration(hours: 25));
        b.services.active.load();
        await t.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('other-job-c1'), skipOffstage: false),
          findsNothing,
        );
      },
    );

    testWidgets('pending price change blocks finishing', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(
          status: ErrandStatus.inProgress,
          category: ErrandCategory.buyForMe,
          itemAmount: '40000.00',
          merchantRoute: MerchantRoute.merchantDirect,
          runnerNotes: 'x',
        ),
      ];
      b.jobs.evidenceById['e1'] = [evidenceItem('e1')];
      b.jobs.pendingById['e1'] = PriceChangeRequest(
        id: 'p1',
        errandId: 'e1',
        requestedByUserId: 'u1',
        fromPrice: '40000.00',
        toPrice: '45000.00',
        status: PriceChangeStatus.requested,
      );
      await _pumpActive(t, b);
      await _scrollTo(t, find.text('Mark task complete'));
      expect(
        find.text(
          'Waiting for the customer to approve KSh 45,000.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(
        find.text("Wait for the customer's answer to finish."),
        findsOneWidget,
      );
      expect(_button(t, 'Mark task complete').onPressed, isNull);
    });

    testWidgets('price row opens v-price-request', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(
          status: ErrandStatus.inProgress,
          category: ErrandCategory.getItForMe,
          itemAmount: '40000.00',
          merchantRoute: MerchantRoute.merchantDirect,
        ),
      ];
      await _pumpActive(t, b);
      await _scrollTo(t, find.text('Request price authorization'));
      await t.tap(find.text('Request price authorization'));
      await t.pumpAndSettle();
      expect(find.byType(PriceRequestScreen), findsOneWidget);
    });

    testWidgets('cancelled purchase job: receipt window and upload', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [
        heldJob(
          status: ErrandStatus.cancelled,
          category: ErrandCategory.buyForMe,
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
        ),
      ];
      b.jobs.historyById['e1'] = [
        historyEntry('e1', ErrandStatus.cancelled, at: testNow),
      ];
      await _pumpActive(t, b);
      expect(
        find.text(
          "This task ended before completion, so there's no runner fee.",
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'You can upload it until Tomorrow, 10:00 AM.',
          findRichText: true,
        ),
        findsNothing,
      );
      expect(find.textContaining('You can upload it until'), findsOneWidget);
      expect(find.text('Upload receipt'), findsOneWidget);

      // Past the window the job is only shown when the runner opened it.
      b.services.shell.showJob('e1');
      b.now = testNow.add(const Duration(hours: 25));
      await t.drag(
        find.byType(RefreshIndicator).hitTestable(),
        const Offset(0, 300),
      );
      await t.pumpAndSettle();
      expect(
        find.text(
          'The upload window has closed. Contact support with your receipt.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('access revoked: job dropped with a notice', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob()];
      await b.services.live.start();
      await _pumpActive(t, b);
      b.realtime.revoked.add(const ErrandAccessRevoked(errandId: 'e1'));
      await t.pumpAndSettle();
      expect(
        find.text('This job is no longer assigned to you.'),
        findsOneWidget,
      );
      expect(find.text('No active job'), findsOneWidget);
    });

    testWidgets('disputed: notice and the resolution note', (t) async {
      final b = TestBackend();
      b.jobs.heldList = [heldJob(status: ErrandStatus.disputed)];
      b.jobs.disputeById['e1'] = const Dispute(
        id: 'd1',
        errandId: 'e1',
        openedBy: 'c1',
        reason: 'x',
        status: DisputeStatus.resolved,
        resolution: 'Photos matched the request.',
      );
      await _pumpActive(t, b);
      expect(
        find.text('The customer reported a problem. Our team is reviewing it.'),
        findsOneWidget,
      );
      expect(find.text('Photos matched the request.'), findsOneWidget);
    });
  });
}
