import 'package:customer_app/src/screens/account/address_form_screen.dart';
import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:customer_app/src/services/session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

class _RecordingPush implements PushTokenRegistrar {
  _RecordingPush(this.log);

  final List<String> log;

  @override
  Future<void> registerAfterSignIn() async => log.add('register');

  @override
  Future<void> unregisterBeforeSignOut() async => log.add('unregister');
}

void main() {
  testWidgets('v-new-details: editing a picked place blocks Continue', (
    t,
  ) async {
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
    await t.tap(find.text('Check It For Me'));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    await t.enterText(
      find.widgetWithText(
        TextField,
        'e.g. Check the apartment in Nyali — video the compound, both '
        'bedrooms and bathroom.',
      ),
      'Check the flat and film it',
    );
    await t.tap(find.text('Search for a place'));
    await t.pumpAndSettle();
    await t.tap(find.text('Home'));
    await t.pumpAndSettle();

    // Edit the picked text: the pick is dropped (row 60).
    await t.enterText(
      find.widgetWithText(TextField, 'Kilimani Rd, Nairobi'),
      'Westlands',
    );
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();
    await t.tap(find.text('Continue →'));
    await t.pumpAndSettle();
    expect(find.text('Choose a place from the list.'), findsOneWidget);
    expect(find.text('Step 3 of 3'), findsNothing);
  });

  testWidgets('x-address-form: editing the address needs a new pick', (
    t,
  ) async {
    final b = TestBackend(placeSearch: FakePlaces());
    const saved = SavedAddress(
      id: 'ad1',
      label: 'Home',
      addressText: 'Kilimani Rd, Nairobi',
      isDefault: false,
      lat: -1.29,
      lon: 36.78,
    );
    await b.pumpScreen(t, const AddressFormScreen(address: saved));
    final save = find.widgetWithText(NitumeButton, 'Save address');
    expect(t.widget<NitumeButton>(save).onPressed, isNotNull);

    await t.enterText(
      find.widgetWithText(TextField, 'Kilimani Rd, Nairobi'),
      'Westlands',
    );
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();
    expect(find.text('Choose an address from the list.'), findsOneWidget);
    expect(t.widget<NitumeButton>(save).onPressed, isNull);

    await t.tap(find.text('Upper Hill'));
    await t.pumpAndSettle();
    await t.tap(save);
    await t.pumpAndSettle();
    expect(b.account.added.single, {
      'id': 'ad1',
      'label': 'Home',
      'addressText': 'Upper Hill, Nairobi',
      'lat': -1.3,
      'lon': 36.81,
    });
  });

  testWidgets('v-task-detail: no payment-details link after a combined STK', (
    t,
  ) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.inProgress, budget: '40000.00'));
    b.payments.summary = PaymentSummary(
      payment: payment(
        merchantAmount: '40000.00',
        flow: PaymentFlow.customerToRunner,
      ),
      merchantPayment: const MerchantPayment(
        route: MerchantRoute.sendToRunner,
        amount: '40000.00',
        paidTo: 'nitume',
      ),
    );
    await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
    expect(find.text('View payment details'), findsNothing);
  });

  test('the session-cleared hook unregisters push while signed in', () async {
    // Core runs beforeSessionCleared before clearing the tokens (e304160);
    // the app's hook unregisters the push device.
    final log = <String>[];
    final auth = FakeAuth()
      ..stored = const AuthTokens(accessToken: 'a', refreshToken: 'r');
    final session = SessionController(auth: auth, push: _RecordingPush(log));
    await session.restore();
    log.clear();
    await session.beforeTokensCleared();
    session.suspend();
    expect(log, ['unregister']);
    expect(session.status, SessionStatus.signedOut);
    expect(session.takeSuspendedFlag(), isTrue);
    // Signed out: nothing more to unregister.
    await session.beforeTokensCleared();
    expect(log, ['unregister']);
  });
}
