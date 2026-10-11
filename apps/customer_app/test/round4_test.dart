import 'package:customer_app/src/screens/checkout/merchant_payment_screen.dart';
import 'package:customer_app/src/navigation/nav.dart';
import 'package:customer_app/src/screens/account/notifications_screen.dart';
import 'package:customer_app/src/screens/checkout/payment_screen.dart';
import 'package:customer_app/src/screens/task/report_problem_screen.dart';
import 'package:customer_app/src/widgets/schematic_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

MerchantPayment till({bool changed = false}) => MerchantPayment(
  route: MerchantRoute.merchantDirect,
  amount: '40000.00',
  merchantName: 'Sarit Shoes',
  tillNumber: '654321',
  merchantDetailsUpdatedAt: changed ? DateTime(2026, 10, 9, 16, 45) : null,
  merchantDetailsChangedAfterPayment: changed,
);

void main() {
  group('x-merchant-payment details changed (row 80)', () {
    testWidgets('no notice without a change', (t) async {
      final b = TestBackend();
      b.payments.summary = PaymentSummary(
        payment: payment(),
        merchantPayment: till(),
      );
      await b.pumpScreen(t, const MerchantPaymentScreen(errandId: 'e1'));
      expect(
        find.textContaining('details changed', findRichText: true),
        findsNothing,
      );
      expect(find.text('654321'), findsOneWidget);
    });

    testWidgets('notice with the change time and Support line', (t) async {
      final b = TestBackend(
        appConfig: AppConfig(
          supportUri: Uri.parse('https://nitume.test/help'),
          onOpenLink: (_) async => true,
        ),
      );
      b.payments.summary = PaymentSummary(
        payment: payment(),
        merchantPayment: till(changed: true),
      );
      await b.pumpScreen(t, const MerchantPaymentScreen(errandId: 'e1'));
      expect(
        find.textContaining(
          "The merchant's payment details changed on",
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('Already paid the old number?', findRichText: true),
        findsOneWidget,
      );
      expect(find.text('Contact support'), findsOneWidget);
      // Only the current number is shown.
      expect(find.text('654321'), findsOneWidget);
    });
  });

  testWidgets('x-report-problem: resolution note and resolved time (row 79)', (
    t,
  ) async {
    final b = TestBackend();
    b.disputes.existing = Dispute(
      id: 'd1',
      errandId: 'e1',
      openedBy: 'u1',
      reason: 'Wrong item delivered',
      status: DisputeStatus.resolved,
      resolution: 'The runner returns the item and buys the right one.',
      verdict: DisputeVerdict.values.first,
      createdAt: DateTime(2026, 10, 7, 10, 41),
      resolvedAt: DateTime(2026, 10, 8, 14, 15),
      updatedAt: DateTime(2026, 10, 9, 9, 0),
    );
    await b.pumpScreen(
      t,
      ReportProblemScreen.read(errand: errand(status: ErrandStatus.completed)),
    );
    expect(find.text('OUTCOME'), findsOneWidget);
    expect(
      find.text('The runner returns the item and buys the right one.'),
      findsOneWidget,
    );
    expect(find.textContaining('Resolved'), findsWidgets);
    expect(find.textContaining('14:15'), findsNothing);
    expect(find.textContaining('2:15 PM'), findsOneWidget);
  });

  testWidgets('checkout keys persist per errand and clear on sign-out', (
    t,
  ) async {
    final b = TestBackend();
    await b.pumpApp(t);
    final k1 = await b.services.paymentAttempts.keyFor('e1');
    expect(await b.services.paymentAttempts.keyFor('e1'), k1);
    await b.services.session.logout();
    await t.pumpAndSettle();
    expect(await b.services.idempotencyKeys.read('e1'), isNull);
  });

  testWidgets('wizard: text typed without a pick is not accepted', (t) async {
    final b = TestBackend();
    await b.pumpApp(t);
    await t.tap(find.text('New task'));
    await t.pumpAndSettle();
    await t.tap(find.text('Wait For Me'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    await t.enterText(
      find.widgetWithText(TextField, 'Search for a place'),
      'Westlands',
    );
    await t.pump(const Duration(milliseconds: 400));
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    expect(find.text('Choose a place from the list.'), findsOneWidget);
    expect(find.text('Choose a location.'), findsNothing);
  });

  testWidgets('wizard: clearing typed text goes back to the empty copy', (
    t,
  ) async {
    final b = TestBackend();
    await b.pumpApp(t);
    await t.tap(find.text('New task'));
    await t.pumpAndSettle();
    await t.tap(find.text('Wait For Me'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    final field = find.widgetWithText(TextField, 'Search for a place');
    await t.enterText(field, 'Westlands');
    await t.enterText(find.widgetWithText(TextField, 'Westlands'), '');
    await t.pump(const Duration(milliseconds: 400));
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    expect(find.text('Choose a location.'), findsOneWidget);
    expect(find.text('Choose a place from the list.'), findsNothing);
  });

  testWidgets('wizard: the title travels in the create request', (t) async {
    final b = TestBackend();
    b.account.addressList = const [
      SavedAddress(
        id: 'ad1',
        label: 'Home',
        addressText: 'Kilimani Rd, Nairobi',
        isDefault: true,
        lat: -1.29,
        lon: 36.78,
      ),
    ];
    await b.pumpApp(t);
    await t.tap(find.text('New task'));
    await t.pumpAndSettle();
    await t.tap(find.text('Wait For Me'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).first, 'NTSA queue');
    await t.enterText(find.byType(TextField).at(1), 'Queue at NTSA for me');
    await t.tap(find.text('Search for a place'));
    await t.pumpAndSettle();
    await t.tap(find.text('Home'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    await t.tap(find.text('Submit task →'));
    await t.pumpAndSettle();
    expect(b.errands.created.single.title, 'NTSA queue');
    expect(b.errands.titles, isEmpty);
  });

  testWidgets('notifications: Mark all read sits in the header', (t) async {
    final b = TestBackend();
    b.notifications.items = [
      AppNotification(
        id: 'n1',
        eventType: 'errand.QUOTED',
        title: 'Quote ready',
        errandId: 'e1',
        isRead: false,
        createdAt: DateTime.now(),
      ),
    ];
    await b.pumpScreen(t, const NotificationsScreen());
    expect(
      find.descendant(
        of: find.byType(NitumePushedHeader),
        matching: find.text('Mark all read'),
      ),
      findsOneWidget,
    );
    await t.tap(find.text('Mark all read'));
    await t.pumpAndSettle();
    expect(b.notifications.allRead, isTrue);
  });

  testWidgets('v-payment: provider failure reason as a second line', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
    b.payments.summary = PaymentSummary(
      payment: payment(status: PaymentStatus.failed),
      stkStatus: StkPaymentState.failed,
      failureReason: 'Request cancelled by user',
    );
    await b.pumpScreen(
      t,
      const PaymentScreen(args: PaymentArgs(errandId: 'e1')),
    );
    expect(find.textContaining('Request cancelled by user'), findsOneWidget);
  });

  testWidgets('schematic fallback: runner dot is 16px overall', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: SizedBox(
          width: 300,
          height: 220,
          child: SchematicMap(
            points: const [],
            runner: ValueNotifier(const GeoPoint(lat: -1.29, lng: 36.78)),
          ),
        ),
      ),
    );
    final dot = find.descendant(
      of: find.byKey(const ValueKey('runner-dot')),
      matching: find.byType(Container),
    );
    expect(t.getSize(dot.first), const Size(16, 16));
  });

  testWidgets('merchant_details.changed opens x-merchant-payment', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.inProgress));
    b.payments.summary = PaymentSummary(
      payment: payment(),
      merchantPayment: till(changed: true),
    );
    b.notifications.items = [
      AppNotification(
        id: 'n1',
        eventType: 'merchant_details.changed',
        title: 'Merchant details changed',
        errandId: 'e1',
        isRead: false,
        createdAt: DateTime.now(),
      ),
    ];
    await b.pumpScreen(t, const NotificationsScreen());
    await t.tap(find.text('Merchant details changed'));
    await t.pumpAndSettle();
    expect(find.byType(MerchantPaymentScreen), findsOneWidget);
    expect(b.notifications.read, ['n1']);
  });

  testWidgets('v-track: errand:access_revoked drops the runner position', (
    t,
  ) async {
    final rt = FakeRealtime();
    final b = TestBackend(realtime: rt);
    b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
    b.errands.trackingValue = const TrackingSnapshot(
      errandId: 'e1',
      status: ErrandStatus.runnerEnRoute,
      live: true,
      points: [],
      runnerLocation: RunnerLocation(point: GeoPoint(lat: -1.29, lng: 36.78)),
    );
    await b.pumpApp(t);
    await t.tap(find.text('Track'));
    await t.pumpAndSettle();
    const caption = 'Live location appears when your runner is on the way.';
    expect(find.text(caption), findsNothing); // position shown

    // No longer the current assignment: tracking now answers 403.
    b.errands.trackingError = const NitumeApiException(
      message: 'forbidden',
      statusCode: 403,
    );
    rt.emitAccessRevoked('e1');
    await t.pumpAndSettle();
    expect(find.text(caption), findsOneWidget); // marker removed at once
  });
}
