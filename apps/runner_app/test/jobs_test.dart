import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/jobs/jobs_tab.dart';
import 'package:runner_app/src/screens/location/location_disclosure_screen.dart';
import 'package:runner_app/src/screens/onboarding/onboard_id_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

const _unavailable = 'That offer is no longer available.';

Future<void> _pumpJobs(WidgetTester t, TestBackend b) =>
    b.pumpScreen(t, const RunnerShell());

Finder _card(String id) => find.byKey(ValueKey('offer-$id'));

Finder _inCard(String id, String text) =>
    find.descendant(of: _card(id), matching: find.text(text));

NitumeButton _button(WidgetTester t, Finder scope, String label) => t.widget(
  find.descendant(
    of: scope,
    matching: find.widgetWithText(NitumeButton, label),
  ),
);

void main() {
  group('v-jobs', () {
    testWidgets('online: availability, count label and offer cards', (t) async {
      final b = TestBackend();
      b.notifications.unread = 2;
      b.jobs.offerList = [
        offer(),
        offer(
          id: 'e2',
          title: null,
          category: ErrandCategory.buyForMe,
          runnerFee: '900.00',
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.merchantDirect,
        ),
      ];
      await _pumpJobs(t, b);

      expect(find.text('Nearby jobs'), findsOneWidget);
      expect(find.text('Online'), findsOneWidget);
      expect(find.text('Nyali · Bamburi'), findsOneWidget);
      expect(
        t.widget<NotificationBell>(find.byType(NotificationBell)).unreadCount,
        2,
      );
      expect(find.bySemanticsLabel('2 offers near you'), findsOneWidget);

      expect(_inCard('e1', 'Check It For Me'), findsOneWidget);
      expect(_inCard('e1', 'KSh 1,750'), findsOneWidget);
      expect(_inCard('e1', 'Check apartment — Nyali'), findsOneWidget);
      expect(_inCard('e1', '1.2 km away'), findsOneWidget);
      // No title: the category name (row 41); purchase terms (§8).
      expect(_inCard('e2', 'Buy For Me'), findsNWidgets(2));
      expect(
        _inCard(
          'e2',
          '1.2 km away · Item KSh 5,000 · Customer pays the merchant',
        ),
        findsOneWidget,
      );
    });

    testWidgets('over the limit: notice and Accept disabled', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
          overPurchaseLimit: true,
        ),
      ];
      await _pumpJobs(t, b);
      expect(
        find.text(
          'Above your purchase limit of KSh 3,000. You can decline this job.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(_button(t, _card('e1'), 'Accept').onPressed, isNull);
      expect(_button(t, _card('e1'), 'Decline').onPressed, isNotNull);
    });

    testWidgets('accept moves to the Active tab', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      await _pumpJobs(t, b);
      await t.tap(_inCard('e1', 'Accept'));
      await t.pumpAndSettle();
      expect(b.jobs.accepted, ['e1']);
      expect(b.services.shell.tab, RunnerTab.active);
    });

    testWidgets('accept refused: expired offer is removed, busy explained', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.offerList = [offer(), offer(id: 'e2')];
      await _pumpJobs(t, b);

      b.jobs.acceptError = apiError(ApiErrorCodes.runnerBusy);
      await t.tap(_inCard('e2', 'Accept'));
      await t.pumpAndSettle();
      expect(find.text('Finish your active job first.'), findsOneWidget);
      expect(_card('e2'), findsOneWidget);

      b.jobs.acceptError = apiError(ApiErrorCodes.offerExpired);
      await t.tap(_inCard('e1', 'Accept'));
      await t.pumpAndSettle();
      expect(_card('e1'), findsNothing);
      expect(find.text(_unavailable), findsOneWidget);
      expect(b.services.shell.tab, RunnerTab.jobs);
    });

    testWidgets('decline needs a reason, then removes the card', (t) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      await _pumpJobs(t, b);

      await t.tap(_inCard('e1', 'Decline'));
      await t.pumpAndSettle();
      expect(find.text('Decline this job?'), findsOneWidget);
      expect(find.text('Above my purchase limit'), findsNothing);
      final dialog = find.byType(DeclineReasonDialog);
      // Row 229: Decline stays disabled until a reason is picked.
      expect(_button(t, dialog, 'Decline').onPressed, isNull);

      await t.tap(find.text('Too far away'));
      await t.pumpAndSettle();
      await t.tap(find.descendant(of: dialog, matching: find.text('Decline')));
      await t.pumpAndSettle();
      expect(b.jobs.declined, [('e1', OfferDeclineReason.tooFar)]);
      expect(_card('e1'), findsNothing);
      expect(find.text(_unavailable), findsNothing);
    });

    testWidgets('over-limit decline pre-selects the purchase-limit reason', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.offerList = [offer(overPurchaseLimit: true)];
      await _pumpJobs(t, b);
      await t.tap(_inCard('e1', 'Decline'));
      await t.pumpAndSettle();
      final dialog = find.byType(DeclineReasonDialog);
      await t.tap(find.descendant(of: dialog, matching: find.text('Decline')));
      await t.pumpAndSettle();
      expect(b.jobs.declined, [('e1', OfferDeclineReason.overPurchaseLimit)]);
    });

    testWidgets('decline of an offer that is gone: removed with a snackbar', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.offerList = [offer()];
      b.jobs.declineError = apiError(ApiErrorCodes.offerExpired);
      await _pumpJobs(t, b);
      await t.tap(_inCard('e1', 'Decline'));
      await t.pumpAndSettle();
      await t.tap(find.text('Other reason'));
      await t.pumpAndSettle();
      await t.tap(
        find.descendant(
          of: find.byType(DeclineReasonDialog),
          matching: find.text('Decline'),
        ),
      );
      await t.pumpAndSettle();
      expect(_card('e1'), findsNothing);
      expect(find.text(_unavailable), findsOneWidget);
    });

    testWidgets('the card ends at the earlier of offer end and deadline', (
      t,
    ) async {
      final b = TestBackend();
      b.jobs.offerList = [
        offer(
          offerExpiresAt: testNow.add(const Duration(minutes: 10)),
          deadlineAt: testNow.add(const Duration(seconds: 30)),
        ),
        // Row 156: no end time, never removed by the client.
        offer(id: 'e2'),
      ];
      await _pumpJobs(t, b);
      expect(_card('e1'), findsOneWidget);

      b.now = testNow.add(const Duration(seconds: 31));
      await t.pump(const Duration(seconds: 31));
      await t.pumpAndSettle();
      expect(_card('e1'), findsNothing);
      expect(_card('e2'), findsOneWidget);
      expect(find.text(_unavailable), findsOneWidget);
    });

    testWidgets('offline without offers: empty state, no location read', (
      t,
    ) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.offline);
      await _pumpJobs(t, b);
      expect(find.text('Offline'), findsOneWidget);
      expect(find.textContaining("You're offline"), findsOneWidget);
      expect(b.location.currentCalls, 0);
    });

    testWidgets('offline with an admin offer: notice, accept refused', (
      t,
    ) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.offline);
      b.jobs.offerList = [offer()];
      b.jobs.acceptError = apiError(ApiErrorCodes.runnerOffline);
      await _pumpJobs(t, b);
      expect(find.text('Go online to accept this offer.'), findsOneWidget);
      // No device fix offline: no distance.
      expect(find.textContaining('km away'), findsNothing);

      await t.tap(_inCard('e1', 'Accept'));
      await t.pumpAndSettle();
      expect(find.text('Go online to accept this job.'), findsOneWidget);
    });

    testWidgets('going online shows the disclosure first', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.offline);
      b.location.accessNow = LocationAccess.denied;
      await _pumpJobs(t, b);

      await t.tap(find.byType(Switch));
      await t.pumpAndSettle();
      expect(find.byType(LocationDisclosureScreen), findsOneWidget);
      await t.tap(find.text('Not now'));
      await t.pumpAndSettle();
      expect(b.account.availabilityCalls, isEmpty);
      expect(
        find.text('Turn on location to receive and do jobs.'),
        findsOneWidget,
      );

      await t.tap(find.byType(Switch));
      await t.pumpAndSettle();
      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(b.account.availabilityCalls, [RunnerAvailability.online]);
      expect(find.text('Online'), findsOneWidget);
    });

    testWidgets('location denied for good: Open Settings', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.offline);
      b.location.accessNow = LocationAccess.deniedForever;
      await _pumpJobs(t, b);
      await t.tap(find.byType(Switch));
      await t.pumpAndSettle();
      await t.tap(find.text('Open Settings'));
      expect(b.permissions.settingsOpened, 1);
    });

    testWidgets('busy: going offline is blocked; active job card', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(availability: RunnerAvailability.busy);
      b.jobs.active = [errand()];
      await _pumpJobs(t, b);
      expect(find.text('You have an active job'), findsOneWidget);
      expect(find.text('Pick up documents'), findsOneWidget);
      expect(find.text('On the way'), findsOneWidget);

      await t.tap(find.byType(Switch));
      await t.pumpAndSettle();
      expect(b.account.availabilityCalls, isEmpty);
      expect(
        find.text('Finish your active job before going offline.'),
        findsOneWidget,
      );

      await t.tap(find.text('You have an active job'));
      await t.pumpAndSettle();
      expect(b.services.shell.tab, RunnerTab.active);
    });

    testWidgets('not verified: disabled switch and verification card', (
      t,
    ) async {
      final b = TestBackend();
      b.account.current = runnerMe(
        availability: RunnerAvailability.offline,
        verification: summary(status: VerificationCheckStatus.missing),
      );
      b.account.records = [];
      await _pumpJobs(t, b);

      expect(t.widget<Switch>(find.byType(Switch)).onChanged, isNull);
      expect(
        find.text('You can go online once your verification is approved.'),
        findsOneWidget,
      );
      expect(find.text('Finish your verification'), findsOneWidget);
      expect(
        find.text('Upload your ID and a selfie to start accepting jobs.'),
        findsOneWidget,
      );
      expect(b.jobs.offersCalls, 0);

      await t.tap(find.text('Continue verification'));
      await t.pumpAndSettle();
      expect(find.byType(OnboardIdScreen), findsOneWidget);
    });

    testWidgets('in review: View status', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(
        verification: summary(status: VerificationCheckStatus.pending),
      );
      await _pumpJobs(t, b);
      expect(
        find.text(
          "We're reviewing your documents. We'll notify you when you're "
          'approved.',
        ),
        findsOneWidget,
      );
      expect(find.text('View status'), findsOneWidget);
    });

    testWidgets('load error: Try again', (t) async {
      final b = TestBackend();
      b.jobs.offersError = networkError;
      await _pumpJobs(t, b);
      expect(find.text("Couldn't load offers."), findsOneWidget);

      b.jobs.offersError = null;
      b.jobs.offerList = [offer()];
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(_card('e1'), findsOneWidget);
    });

    testWidgets('offers refresh every 20 s while the tab shows', (t) async {
      final b = TestBackend();
      await _pumpJobs(t, b);
      final before = b.jobs.offersCalls;
      b.jobs.offerList = [offer()];
      await t.pump(JobsTab.pollInterval);
      await t.pumpAndSettle();
      expect(b.jobs.offersCalls, before + 1);
      expect(_card('e1'), findsOneWidget);
    });
  });
}
