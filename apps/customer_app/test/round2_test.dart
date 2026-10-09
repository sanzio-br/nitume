import 'package:customer_app/src/screens/account/notifications_screen.dart';
import 'package:customer_app/src/services/shell_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

AppNotification _note(String type) => AppNotification(
  id: 'n-$type',
  eventType: type,
  title: 'Title $type',
  errandId: 'e1',
  isRead: false,
  createdAt: DateTime.now(),
);

void main() {
  testWidgets('mid-session suspension returns to phone entry', (t) async {
    final b = TestBackend();
    await b.pumpApp(t);
    b.services.session.suspend();
    await t.pumpAndSettle();
    expect(find.text("Someone there, when you can't be."), findsOneWidget);
    expect(
      find.text("This account can't sign in. Contact support."),
      findsOneWidget,
    );
  });

  testWidgets('price-change notification opens Track with the modal flag', (
    t,
  ) async {
    final b = TestBackend();
    b.notifications.items = [_note('price_change.requested')];
    await b.pumpScreen(t, const NotificationsScreen());
    expect(find.byIcon(Icons.sell_outlined), findsOneWidget);
    await t.tap(find.text('Title price_change.requested'));
    await t.pumpAndSettle();
    expect(b.services.shell.tab, ShellTab.track);
    expect(b.services.shell.takeOpenPriceChange(), isTrue);
  });

  testWidgets('refund notification opens task detail', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.cancelled));
    b.notifications.items = [_note('refund.approved')];
    await b.pumpScreen(t, const NotificationsScreen());
    expect(find.byIcon(Icons.receipt_long_outlined), findsOneWidget);
    await t.tap(find.text('Title refund.approved'));
    await t.pumpAndSettle();
    expect(find.text('Task detail'), findsOneWidget);
  });

  testWidgets('home joins the active errand room and refreshes on status', (
    t,
  ) async {
    final rt = FakeRealtime();
    final b = TestBackend(realtime: rt);
    b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
    await b.pumpApp(t);
    expect(rt.currentState, RealtimeConnectionState.connected);
    expect(rt.joined, contains('e1'));
    expect(find.text('Brian K. is en route'), findsOneWidget);

    b.errands.put(errand(status: ErrandStatus.arrived));
    rt.emitStatus('e1', ErrandStatus.arrived);
    await t.pumpAndSettle();
    expect(find.text('Brian K. has arrived'), findsOneWidget);
  });

  testWidgets('a live price-change event opens the modal', (t) async {
    final rt = FakeRealtime();
    final b = TestBackend(realtime: rt);
    b.errands.put(errand(status: ErrandStatus.inProgress));
    b.priceChanges.pendingValue = priceChange();
    await b.pumpApp(t);
    rt.emitPriceChange('e1');
    await t.pumpAndSettle();
    expect(find.text('+ KSh 5,000 additional'), findsOneWidget);
  });

  testWidgets('quote.reissued notification opens the checkout', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
    b.notifications.items = [_note('quote.reissued')];
    await b.pumpScreen(t, const NotificationsScreen());
    await t.tap(find.text('Title quote.reissued'));
    await t.pumpAndSettle();
    expect(find.text('Your quote'), findsOneWidget);
  });
}
