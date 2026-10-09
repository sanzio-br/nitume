import 'package:customer_app/src/navigation/nav.dart';
import 'package:customer_app/src/screens/checkout/awaiting_quote_screen.dart';
import 'package:customer_app/src/screens/checkout/payment_screen.dart';
import 'package:customer_app/src/screens/checkout/price_change_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Quote quote({DateTime? expiresAt}) => Quote(
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
  expiresAt: expiresAt,
);

const _expired = NitumeApiException(
  message: 'expired',
  statusCode: 409,
  code: ApiErrorCodes.quoteExpired,
);

void main() {
  priceAuthMain();

  testWidgets('expired quote: no chip, notice, no CTA, decline stays', (
    t,
  ) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.quoted,
        quotedPrice: '2200.00',
        withRunner: false,
      ),
    );
    b.errands.quoteValue = quote(
      expiresAt: DateTime.now().subtract(const Duration(minutes: 5)),
    );
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    expect(find.text('Quote ready'), findsNothing);
    expect(
      find.text("This quote has expired. We'll send you a new one."),
      findsOneWidget,
    );
    expect(find.textContaining('Expired at', findRichText: true), findsOne);
    expect(find.textContaining('Confirm & pay'), findsNothing);
    expect(find.text('Decline and cancel task'), findsOneWidget);
  });

  testWidgets('quote_expired on accept switches to the expired state', (
    t,
  ) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.quoted,
        quotedPrice: '2200.00',
        withRunner: false,
      ),
    );
    b.errands.quoteValue = quote();
    b.errands.transitionError = _expired;
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    await t.tap(find.text('Confirm & pay KSh 2,200 →'));
    await t.pumpAndSettle();
    expect(
      find.text("This quote has expired. We'll send you a new one."),
      findsOneWidget,
    );
    expect(b.payments.initiations, isEmpty);
  });

  testWidgets('merchant details available: merchant-direct is the default', (
    t,
  ) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.quoted,
        budget: '40000.00',
        quotedPrice: '2200.00',
        withRunner: false,
        merchantDetailsAvailable: true,
        feeTotal: '2200.00',
      ),
    );
    b.errands.quoteValue = quote();
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    final direct = t.widget<NitumeRadioRow>(
      find.widgetWithText(
        NitumeRadioRow,
        'Pay merchant directly (recommended)',
      ),
    );
    expect(direct.selected, isTrue);
    expect(direct.onSelected, isNotNull);
    // Merchant-direct: the item amount is not in the fee STK.
    expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);
    await t.tap(find.text('Confirm & pay KSh 2,200 →'));
    await t.pumpAndSettle();
    expect(b.payments.initiations.single.$3, MerchantRoute.merchantDirect);
  });

  testWidgets('v-payment: quote_expired on initiate returns to the quote', (
    t,
  ) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
    b.payments.initiateError = _expired;
    await b.pumpScreen(
      t,
      const PaymentScreen(
        args: PaymentArgs(errandId: 'e1', fromCheckout: true),
      ),
    );
    expect(find.byType(AwaitingQuoteScreen), findsOneWidget);
    expect(
      find.text("This quote has expired. We'll send you a new one."),
      findsOneWidget,
    );
  });

  testWidgets('ACCEPTED re-entry accepts the newest quote (row 72)',
      (t) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.accepted,
        quotedPrice: '2200.00',
        withRunner: false,
      ),
    );
    b.errands.quoteValue = quote();
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    await t.tap(find.text('Confirm & pay KSh 2,200 →'));
    await t.pumpAndSettle();
    expect(b.errands.quoteAccepts, isEmpty); // no re-quote pending
    expect(b.payments.initiations, hasLength(1));
  });

  testWidgets('a pending re-quote is accepted before paying (row 72)',
      (t) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.accepted,
        quotedPrice: '2200.00',
        withRunner: false,
        quoteAcceptanceRequired: true,
      ),
    );
    b.errands.quoteValue = quote();
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    await t.tap(find.text('Confirm & pay KSh 2,200 →'));
    await t.pumpAndSettle();
    expect(b.errands.quoteAccepts, ['e1']);
    expect(b.payments.initiations, hasLength(1));
  });

  testWidgets('quote:reissued refreshes the checkout', (t) async {
    final rt = FakeRealtime()..setState(RealtimeConnectionState.connected);
    final b = TestBackend(realtime: rt);
    b.errands.put(
      errand(
        status: ErrandStatus.accepted,
        quotedPrice: '2200.00',
        withRunner: false,
        feeTotal: '2200.00',
      ),
    );
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);
    b.errands.put(
      errand(
        status: ErrandStatus.accepted,
        quotedPrice: '2500.00',
        withRunner: false,
        feeTotal: '2500.00',
        quoteAcceptanceRequired: true,
      ),
    );
    rt.emitQuoteReissued('e1');
    await t.pumpAndSettle();
    expect(find.text('Confirm & pay KSh 2,500 →'), findsOneWidget);
  });

  testWidgets('v-payment: quote_not_accepted returns to the checkout',
      (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.accepted, withRunner: false));
    b.payments.initiateError = const NitumeApiException(
      message: 'not accepted',
      statusCode: 409,
      code: 'quote_not_accepted',
    );
    await b.pumpScreen(
      t,
      const PaymentScreen(
        args: PaymentArgs(errandId: 'e1', fromCheckout: true),
      ),
    );
    expect(find.byType(AwaitingQuoteScreen), findsOneWidget);
  });

  test('client confirmation window is at least the server 120 s', () {
    expect(
      PaymentScreen.confirmationWindow,
      greaterThanOrEqualTo(const Duration(seconds: 120)),
    );
  });
}

/// Opens the price-change modal from a host screen.
Future<void> openPriceChange(WidgetTester t, TestBackend b, Errand e) async {
  await b.pumpScreen(
    t,
    Builder(
      builder: (context) => TextButton(
        onPressed: () => showPriceChangeDialog(context, errand: e),
        child: const Text('open'),
      ),
    ),
  );
  await t.tap(find.text('open'));
  await t.pumpAndSettle();
}

void priceAuthMain() {
  testWidgets('v-price-auth: decrease copy', (t) async {
    final b = TestBackend();
    b.priceChanges.pendingValue = priceChange(toPrice: '35000.00');
    await openPriceChange(t, b, errand());
    expect(
      find.text(
        'Brian K. found the item priced lower than quoted. Approve the new '
        'price to continue?',
      ),
      findsOneWidget,
    );
    expect(find.text('− KSh 5,000 less'), findsOneWidget);
    expect(find.text('Approve new price'), findsOneWidget);
  });

  testWidgets('v-price-auth: not IN_PROGRESS shows already answered',
      (t) async {
    final b = TestBackend();
    b.priceChanges.pendingValue = priceChange();
    await openPriceChange(t, b, errand(status: ErrandStatus.arrived));
    expect(find.text('This price change was already answered.'), findsOne);
  });

  testWidgets('v-price-auth: merchant_details_missing asks for a route',
      (t) async {
    final b = TestBackend();
    b.priceChanges.pendingValue = priceChange();
    b.priceChanges.requireRoute = true;
    b.priceChanges.routeCode = ApiErrorCodes.merchantDetailsMissing;
    await openPriceChange(t, b, errand());
    await t.tap(find.text('Approve KSh 5,000 increase'));
    await t.pumpAndSettle();
    expect(find.text('Send purchase amount to runner'), findsOneWidget);
    expect(b.priceChanges.approved, isEmpty);
  });

  testWidgets('v-price-auth: reject body mentions the refund review',
      (t) async {
    final b = TestBackend();
    b.priceChanges.pendingValue = priceChange();
    await openPriceChange(t, b, errand());
    await t.tap(find.text('Reject & cancel task'));
    await t.pumpAndSettle();
    expect(
      find.text(
        "The runner will stop work on this task. We'll review a refund of "
        "what you've paid, and you can follow it on the task.",
      ),
      findsOneWidget,
    );
  });
}
