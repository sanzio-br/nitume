import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/jobs/job_detail_screen.dart';
import 'package:runner_app/src/services/push_routing.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

PushMessage _m(String event, {String? errandId = 'e1'}) =>
    PushMessage(eventType: event, errandId: errandId, notificationId: 'n1');

void main() {
  test('runner job kinds open v-active, offers open the detail', () {
    for (final e in [
      'errand.CANCELLED',
      'errand.FAILED',
      'errand.COMPLETED',
      'errand.DISPUTED',
      RunnerNotificationEvents.disputeResolved,
      RunnerNotificationEvents.priceChangeApproved,
      RunnerNotificationEvents.priceChangeRejected,
    ]) {
      expect(pushTargetFor(_m(e)), PushTarget.activeJob, reason: e);
    }
    expect(pushTargetFor(_m('errand.RUNNER_ASSIGNED')), PushTarget.offer);
    expect(pushTargetFor(_m('refund.approved')), PushTarget.none);
    expect(
      pushTargetFor(_m('errand.CANCELLED', errandId: null)),
      PushTarget.none,
    );
  });

  testWidgets('a tapped job push focuses the Active tab on that job', (
    t,
  ) async {
    final b = TestBackend();
    b.jobs.heldList = [heldJob(status: ErrandStatus.cancelled)];
    await b.pumpApp(t, signedIn: false);
    // Sign in through OTP so the app listens for taps.
    await t.enterText(find.byType(TextField), '0733111222');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).last, '123456');
    await t.pumpAndSettle();

    b.pushService.opened.add(_m(RunnerNotificationEvents.priceChangeRejected));
    await t.pumpAndSettle();
    expect(b.services.shell.tab, RunnerTab.active);
    expect(b.services.shell.focusedJob, 'e1');

    b.jobs.offerList = [offer(id: 'e5')];
    b.pushService.opened.add(_m('errand.RUNNER_ASSIGNED', errandId: 'e5'));
    await t.pumpAndSettle();
    expect(find.byType(JobDetailScreen), findsOneWidget);
  });
}
