import 'package:customer_app/src/screens/account/address_form_screen.dart';
import 'package:customer_app/src/screens/account/addresses_screen.dart';
import 'package:customer_app/src/screens/account/notifications_screen.dart';
import 'package:customer_app/src/screens/account/payment_method_form_screen.dart';
import 'package:customer_app/src/screens/account/payment_methods_screen.dart';
import 'package:customer_app/src/services/session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

AppNotification note(String id, {bool read = false, String? errandId = 'e1'}) =>
    AppNotification(
      id: id,
      eventType: 'errand.RUNNER_EN_ROUTE',
      title: 'Brian K. is en route',
      body: 'Apartment check — Nyali',
      errandId: errandId,
      isRead: read,
      createdAt: DateTime.now().subtract(const Duration(minutes: 2)),
    );

void main() {
  group('v-history', () {
    testWidgets('finished tasks with fees paid and red Cancelled', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      b.errands.put(
        errand(
          id: 'e2',
          status: ErrandStatus.cancelled,
          title: 'NTSA queue',
          withRunner: false,
          updatedAt: DateTime(2026, 10, 1),
        ),
      );
      b.errands.put(errand(id: 'e3', status: ErrandStatus.inProgress));
      b.payments.summary = PaymentSummary(payment: payment());
      await b.pumpApp(t);
      await t.tap(find.text('History'));
      await t.pumpAndSettle();

      expect(find.text('Apartment check — Nyali'), findsOneWidget);
      expect(find.text('NTSA queue'), findsOneWidget);
      expect(find.text('Cancelled'), findsOneWidget);
      final chip = t.widget<StatusChip>(
        find.ancestor(of: find.text('Cancelled'), matching: find.byType(StatusChip)),
      );
      expect(chip.tone, StatusTone.danger);
      expect(find.text('KSh 2,200'), findsWidgets);
      expect(find.textContaining('Brian K.'), findsOneWidget);
    });

    testWidgets('empty state', (t) async {
      final b = TestBackend();
      await b.pumpApp(t);
      await t.tap(find.text('History'));
      await t.pumpAndSettle();
      expect(find.text('No tasks yet.'), findsOneWidget);
    });
  });

  group('v-notifications', () {
    testWidgets('unread row, tap marks read and opens Track', (t) async {
      final b = TestBackend();
      b.notifications.items = [note('n1'), note('n2', read: true)];
      await b.pumpScreen(t, const NotificationsScreen());
      expect(find.text('Mark all read'), findsOneWidget);
      expect(find.text('2m'), findsNWidgets(2));
      await t.tap(find.text('Brian K. is en route').first);
      await t.pumpAndSettle();
      expect(b.notifications.read, ['n1']);
      expect(b.services.shell.trackErrandId, 'e1');
    });

    testWidgets('empty', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, const NotificationsScreen());
      expect(find.text("You're all caught up."), findsOneWidget);
      expect(find.text('Mark all read'), findsNothing);
    });
  });

  group('addresses', () {
    testWidgets('empty state', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, const AddressesScreen());
      expect(find.text('No saved addresses yet.'), findsOneWidget);
    });

    testWidgets('list with the default tag', (t) async {
      final b = TestBackend();
      b.account.addressList = const [
        SavedAddress(
          id: 'ad1',
          label: 'Home',
          addressText: 'Kilimani Rd, Nairobi',
          isDefault: true,
        ),
      ];
      await b.pumpScreen(t, const AddressesScreen());
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Default'), findsOneWidget);
    });

    testWidgets('without Places: notice and Save disabled', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, const AddressFormScreen());
      expect(find.text("Place search isn't available yet."), findsOneWidget);
      expect(find.text('Enter an address.'), findsNothing);
      await t.tap(find.text('Office'));
      await t.pumpAndSettle();
      final save = find.widgetWithText(NitumeButton, 'Save address');
      expect(t.widget<NitumeButton>(save).onPressed, isNull);
    });

    testWidgets('without Places, edit saves the name only', (t) async {
      final b = TestBackend();
      b.account.addressList = const [
        SavedAddress(
          id: 'ad1',
          label: 'Home',
          addressText: 'Kilimani Rd, Nairobi',
          isDefault: false,
          lat: -1.29,
          lon: 36.78,
        ),
      ];
      await b.pumpScreen(
        t,
        AddressFormScreen(address: b.account.addressList.single),
      );
      await t.enterText(find.byType(TextField).first, 'Home 2');
      await t.tap(find.text('Save address'));
      await t.pumpAndSettle();
      expect(b.account.added.single, {
        'id': 'ad1',
        'label': 'Home 2',
        'addressText': null,
        'lat': null,
        'lon': null,
      });
    });

    testWidgets('with Places: Save needs a picked place, sends coords',
        (t) async {
      final b = TestBackend(placeSearch: FakePlaces());
      await b.pumpScreen(t, const AddressFormScreen());
      final save = find.widgetWithText(NitumeButton, 'Save address');
      expect(t.widget<NitumeButton>(save).onPressed, isNull);

      await t.tap(find.text('Office'));
      await t.enterText(
        find.widgetWithText(TextField, 'Search for a place'),
        'Upper',
      );
      await t.pump(const Duration(milliseconds: 400));
      await t.pumpAndSettle();
      await t.tap(find.text('Upper Hill'));
      await t.pumpAndSettle();
      await t.tap(save);
      await t.pumpAndSettle();
      expect(b.account.added.single, {
        'label': 'Office',
        'addressText': 'Upper Hill, Nairobi',
        'lat': -1.3,
        'lon': 36.81,
        'isDefault': false,
      });
    });
  });

  group('payment methods', () {
    testWidgets('empty state names the sign-in number', (t) async {
      final b = TestBackend();
      await b.services.session.completeSignIn(
        AuthResult(
          user: user(),
          tokens: const AuthTokens(accessToken: 'a', refreshToken: 'r'),
        ),
      );
      await b.pumpScreen(t, const PaymentMethodsScreen());
      expect(
        find.text(
          "No M-Pesa numbers saved. We'll charge your sign-in number, "
          '+254 712 ••• 678.',
        ),
        findsOneWidget,
      );
      expect(find.text('VISA'), findsNothing);
    });

    testWidgets('add M-Pesa number: validates, masks, normalizes', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, const PaymentMethodFormScreen());
      await t.enterText(find.byType(TextField).first, '0712');
      await t.tap(find.text('Save'));
      await t.pumpAndSettle();
      expect(
        find.text('Enter a valid Kenyan number, e.g. +254 712 345 678'),
        findsOneWidget,
      );
      await t.enterText(find.byType(TextField).first, '0712345678');
      await t.tap(find.text('Save'));
      await t.pumpAndSettle();
      expect(b.account.added.single, {
        'label': 'M-Pesa',
        'detail': '+254 712 ••• 678',
        'phoneNumber': '+254712345678',
        'isDefault': false,
      });
    });
  });

  group('v-profile', () {
    testWidgets('name, meta, no recurring tasks, log out', (t) async {
      final b = TestBackend();
      b.errands.countValue = 42;
      await b.pumpApp(t);
      await t.tap(find.text('Profile'));
      await t.pumpAndSettle();

      expect(find.text('Achieng Otieno'), findsOneWidget);
      expect(find.text('Customer since Feb 2026 · 42 tasks'), findsOneWidget);
      expect(find.text('Recurring tasks'), findsNothing);
      expect(find.text('Support'), findsNothing); // not configured (SQ-2)

      await t.tap(find.text('Log out'));
      await t.pumpAndSettle();
      expect(find.text('Log out of Nitume?'), findsOneWidget);
      await t.tap(find.widgetWithText(NitumeButton, 'Log out'));
      await t.pumpAndSettle();
      expect(b.auth.loggedOut, isTrue);
      expect(b.services.session.status, SessionStatus.signedOut);
      expect(find.text("Someone there, when you can't be."), findsOneWidget);
    });
  });
}
