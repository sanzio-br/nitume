import 'package:customer_app/src/navigation/nav.dart';
import 'package:customer_app/src/screens/checkout/awaiting_quote_screen.dart';
import 'package:customer_app/src/screens/checkout/merchant_payment_screen.dart';
import 'package:customer_app/src/screens/checkout/payment_screen.dart';
import 'package:customer_app/src/services/shell_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

void main() {
  group('v-home', () {
    testWidgets('greets by first name and shows active + recent', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      b.errands.put(
        errand(
          id: 'e2',
          status: ErrandStatus.completed,
          title: 'Buy shoes — Sarit Centre',
          updatedAt: DateTime(2026, 10, 6),
        ),
      );
      await b.pumpApp(t);

      expect(find.text('Achieng'), findsOneWidget);
      expect(find.text('Buy For Me'), findsOneWidget);
      expect(find.text('Business Tasks'), findsNothing);
      expect(find.text('Apartment check — Nyali'), findsOneWidget);
      expect(find.text('Brian K. is en route'), findsOneWidget);
      expect(find.text('Track live →'), findsOneWidget);
      expect(find.text('Buy shoes — Sarit Centre'), findsOneWidget);
      expect(find.text('Completed'), findsOneWidget);

      await t.tap(find.text('Track live →'));
      await t.pumpAndSettle();
      expect(b.services.shell.tab, ShellTab.track);
    });

    testWidgets('error state offers a retry', (t) async {
      final b = TestBackend();
      b.errands.listError = const NitumeApiException(message: 'x');
      await b.pumpApp(t);
      expect(find.text("Couldn't load your tasks."), findsOneWidget);
      b.errands.listError = null;
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(find.text("Couldn't load your tasks."), findsNothing);
    });
  });

  group('wizard', () {
    testWidgets('category → details validation → review → submit', (t) async {
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
      expect(find.text('Step 1 of 3'), findsOneWidget);
      final cont = find.widgetWithText(NitumeButton, 'Continue →');
      expect(t.widget<NitumeButton>(cont).onPressed, isNull);

      await t.tap(find.text('Check It For Me'));
      await t.pumpAndSettle();
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      expect(find.text('Task details'), findsOneWidget);

      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      expect(
        find.text('Tell the runner a bit more (at least 5 characters).'),
        findsOneWidget,
      );
      expect(find.text('Choose a location.'), findsOneWidget);

      await t.enterText(
        find.widgetWithText(
          TextField,
          'e.g. Check the apartment in Nyali — '
          'video the compound, both bedrooms and bathroom.',
        ),
        'Check the flat and film it',
      );
      await t.tap(find.text('Search for a place'));
      await t.pumpAndSettle();
      await t.tap(find.text('Home'));
      await t.pumpAndSettle();
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();

      expect(find.text('Step 3 of 3'), findsOneWidget);
      expect(find.textContaining("We couldn't estimate"), findsOneWidget);
      await t.tap(find.text('Submit task →'));
      await t.pumpAndSettle();

      final req = b.errands.created.single;
      expect(req.category, ErrandCategory.checkItForMe);
      expect(req.locations.single.pointType, ErrandPointType.taskSite);
      expect(req.locations.single.addressText, 'Kilimani Rd, Nairobi');
      expect(req.toJson().containsKey('urgency'), isFalse);
      expect(req.deadlineAt, isNotNull);
      expect(b.errands.submitted, ['new1']);
      expect(find.text('Preparing your quote'), findsOneWidget);
    });

    testWidgets('back after entering details asks to discard', (t) async {
      final b = TestBackend();
      await b.pumpApp(t);
      await t.tap(find.text('New task'));
      await t.pumpAndSettle();
      await t.tap(find.text('Wait For Me'));
      await t.pumpAndSettle();
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, 'NTSA queue');
      await t.tap(find.byType(NitumeBackButton));
      await t.pumpAndSettle();
      await t.tap(find.byType(NitumeBackButton));
      await t.pumpAndSettle();
      expect(find.text('Discard this task?'), findsOneWidget);
      await t.tap(find.text('Discard'));
      await t.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsNothing);
    });
  });

  group('x-awaiting-quote', () {
    testWidgets('waiting state, cancel confirm', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.requested, withRunner: false));
      await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
      expect(find.text('Preparing your quote'), findsOneWidget);
      expect(find.text('Awaiting quote'), findsOneWidget);

      await t.tap(find.text('Cancel task'));
      await t.pumpAndSettle();
      expect(find.text('Cancel this task?'), findsOneWidget);
      await t.tap(find.text('Keep task'));
      await t.pumpAndSettle();
      expect(b.errands.transitions, isEmpty);
    });

    testWidgets('checkout: components, route, accept and pay', (t) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: ErrandStatus.quoted,
          budget: '40000.00',
          quotedPrice: '2200.00',
          withRunner: false,
        ),
      );
      b.errands.quoteValue = const Quote(
        id: 'q1',
        errandId: 'e1',
        baseFee: '1500.00',
        distanceFee: '700.00',
        timeFee: '0.00',
        urgencyFee: '0.00',
        complexityFee: '0.00',
        premiumFee: '0.00',
        total: '2200.00',
        currency: 'KES',
      );
      await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));

      expect(find.text('Quote ready'), findsOneWidget);
      // OA-4: no internal quote parts, only the fee total.
      expect(find.text('Base fee'), findsNothing);
      expect(find.text('Distance fee'), findsNothing);
      expect(find.text('Total (service + runner fee)'), findsOneWidget);
      expect(find.text('KSh 2,200'), findsOneWidget);
      expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);
      expect(find.text('Item amount'), findsOneWidget);
      expect(find.text('Let runner advance the purchase'), findsNothing);
      final direct = t.widget<NitumeRadioRow>(
        find.widgetWithText(
          NitumeRadioRow,
          'Pay merchant directly (recommended)',
        ),
      );
      expect(direct.onSelected, isNull);

      await t.tap(find.text('Confirm & pay KSh 2,200 →'));
      await t.pumpAndSettle();
      expect(b.errands.transitions.single, ('e1', ErrandStatus.accepted));
      final init = b.payments.initiations.single;
      expect(init.$3, MerchantRoute.sendToRunner);
      expect(find.text('Check your phone'), findsOneWidget);
    });
  });

  testWidgets('x-awaiting-quote: ACCEPTED shows checkout, no accept call',
      (t) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.accepted,
        budget: '40000.00',
        quotedPrice: '2200.00',
        withRunner: false,
      ),
    );
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    expect(find.text('Awaiting payment'), findsOneWidget);
    expect(find.text('Send purchase amount to runner'), findsOneWidget);
    await t.tap(find.text('Confirm & pay KSh 2,200 →'));
    await t.pumpAndSettle();
    expect(b.errands.transitions, isEmpty);
    expect(b.payments.initiations.single.$3, MerchantRoute.sendToRunner);
  });

  group('v-payment', () {
    Future<TestBackend> open(WidgetTester t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
      await b.pumpScreen(
        t,
        const PaymentScreen(
          args: PaymentArgs(errandId: 'e1', fromCheckout: true),
        ),
      );
      return b;
    }

    testWidgets('pending → timeout → new prompt uses a new key', (t) async {
      final b = await open(t);
      expect(find.text('Check your phone'), findsOneWidget);
      expect(find.text('KSh 2,200'), findsOneWidget);
      final firstKey = b.payments.initiations.single.$2;

      b.payments.summary = PaymentSummary(
        payment: payment(status: PaymentStatus.pending),
        stkStatus: StkPaymentState.timeout,
      );
      await t.tap(find.text("I've paid — continue"));
      await t.pumpAndSettle();
      expect(find.text('Still checking your payment'), findsOneWidget);
      expect(find.text("Payment didn't go through"), findsNothing);

      await t.tap(find.text('Send a new prompt'));
      await t.pumpAndSettle();
      expect(b.payments.initiations.length, 2);
      expect(b.payments.initiations[1].$2, isNot(firstKey));
    });

    testWidgets('failed shows retry; success goes to Track', (t) async {
      final b = await open(t);
      b.payments.summary = PaymentSummary(
        payment: payment(status: PaymentStatus.failed),
        stkStatus: StkPaymentState.failed,
      );
      await t.tap(find.text("I've paid — continue"));
      await t.pumpAndSettle();
      expect(find.text("Payment didn't go through"), findsOneWidget);

      b.payments.initiateState = StkPaymentState.success;
      await t.tap(find.text('Try again'));
      await t.pump();
      expect(find.text('Payment received'), findsOneWidget);
      await t.pump(const Duration(seconds: 2));
      await t.pumpAndSettle();
      expect(b.services.shell.tab, ShellTab.track);
      expect(b.services.shell.trackErrandId, 'e1');
    });

    testWidgets('network error retry reuses the same key', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
      b.payments.initiateError = const NitumeApiException(
        message: 'offline',
        isNetworkError: true,
      );
      await b.pumpScreen(
        t,
        const PaymentScreen(
          args: PaymentArgs(errandId: 'e1', fromCheckout: true),
        ),
      );
      expect(find.text("Couldn't send the prompt"), findsOneWidget);
      b.payments.initiateError = null;
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(b.payments.initiations[0].$2, b.payments.initiations[1].$2);
    });

    testWidgets('reopening an existing payment sends no new prompt', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
      b.payments.summary = PaymentSummary(
        payment: payment(status: PaymentStatus.pending),
        stkStatus: StkPaymentState.pending,
      );
      await b.pumpScreen(
        t,
        const PaymentScreen(args: PaymentArgs(errandId: 'e1')),
      );
      expect(find.text('Check your phone'), findsOneWidget);
      expect(b.payments.initiations, isEmpty);
    });
  });

  group('x-merchant-payment', () {
    testWidgets('send-to-runner shows the pending notice', (t) async {
      final b = TestBackend();
      b.payments.summary = const PaymentSummary(
        merchantPayment: MerchantPayment(
          route: MerchantRoute.sendToRunner,
          amount: '40000.00',
        ),
      );
      await b.pumpScreen(t, const MerchantPaymentScreen(errandId: 'e1'));
      expect(find.text('Pay your runner'), findsOneWidget);
      expect(find.text('KSh 40,000'), findsOneWidget);
      expect(
        find.text(
          "We'll show you how to send this amount to your runner here.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('merchant till details with copy rows', (t) async {
      final b = TestBackend();
      b.payments.summary = const PaymentSummary(
        merchantPayment: MerchantPayment(
          route: MerchantRoute.merchantDirect,
          amount: '45000.00',
          merchantName: 'Sarit Shoes',
          tillNumber: '123456',
        ),
      );
      await b.pumpScreen(
        t,
        const MerchantPaymentScreen(
          errandId: 'e1',
          approvedIncrease: '5000.00',
        ),
      );
      expect(find.text('Till number (Buy Goods)'), findsOneWidget);
      expect(find.text('123456'), findsOneWidget);
      expect(find.text('Copy'), findsNWidgets(2));
      expect(
        find.textContaining('increase you approved', findRichText: true),
        findsOneWidget,
      );
    });
  });
}
