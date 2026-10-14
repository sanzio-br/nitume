import 'package:customer_app/src/screens/auth/phone_screen.dart';
import 'package:customer_app/src/screens/checkout/merchant_payment_screen.dart';
import 'package:customer_app/src/screens/shell/home_tab.dart';
import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:customer_app/src/util/display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Evidence photo(String id, int minute) => Evidence(
  id: id,
  errandId: 'e1',
  type: EvidenceType.photo,
  capturedAt: fixtureAt(10, minute),
);

void main() {
  group('x-legal', () {
    testWidgets('plain text when no link can be opened', (t) async {
      final b = TestBackend(
        appConfig: AppConfig(termsUri: Uri.parse('https://nitume.test/terms')),
      );
      await b.pumpScreen(t, const PhoneScreen());
      expect(find.text('Terms'), findsOneWidget);
      expect(find.widgetWithText(NitumeButton, 'Terms'), findsNothing);
    });

    testWidgets('configured links open through AppConfig, 48dp', (t) async {
      final opened = <Uri>[];
      final b = TestBackend(
        appConfig: AppConfig(
          termsUri: Uri.parse('https://nitume.test/terms'),
          privacyUri: Uri.parse('https://nitume.test/privacy'),
          onOpenLink: (uri) async {
            opened.add(uri);
            return true;
          },
        ),
      );
      await b.pumpScreen(t, const PhoneScreen());
      final link = find.widgetWithText(NitumeButton, 'Privacy Policy');
      expect(t.getSize(link).height, greaterThanOrEqualTo(48));
      await t.tap(link);
      await t.pumpAndSettle();
      expect(opened, [Uri.parse('https://nitume.test/privacy')]);
    });

    testWidgets('open failure shows the snackbar', (t) async {
      final b = TestBackend(
        appConfig: AppConfig(
          termsUri: Uri.parse('https://nitume.test/terms'),
          onOpenLink: (_) async => false,
        ),
      );
      await b.pumpScreen(t, const PhoneScreen());
      await t.tap(find.widgetWithText(NitumeButton, 'Terms'));
      await t.pumpAndSettle();
      expect(
        find.text("Couldn't open the page. Try again later."),
        findsOneWidget,
      );
    });
  });

  group('x-evidence-viewer', () {
    testWidgets('opens at the tapped item with counter and caption', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      b.evidence.items = [photo('ev1', 41), photo('ev2', 43)];
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));

      await t.tap(find.byType(EvidenceTile).at(1));
      await t.pumpAndSettle();
      expect(find.byType(EvidenceViewer), findsOneWidget);
      expect(find.text('2/2'), findsOneWidget);
      expect(find.text('Photo · 10:43 AM', findRichText: true), findsOneWidget);
    });
  });

  group('v-task-detail', () {
    testWidgets('Rate this task also for SETTLED when unrated', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.settled));
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      expect(find.text('Rate this task'), findsOneWidget);
    });

    testWidgets('View your report after a resolved dispute', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      b.disputes.existing = Dispute(
        id: 'd1',
        errandId: 'e1',
        openedBy: 'u1',
        reason: 'Wrong item',
        status: DisputeStatus.resolved,
      );
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      expect(find.text('View your report'), findsOneWidget);
      expect(find.text('Report a problem with this task'), findsNothing);
    });
  });

  testWidgets('v-home: no name shows the greeting line only', (t) async {
    final b = TestBackend();
    await b.pumpScreen(t, const Scaffold(body: HomeTab(active: true)));
    final top = t.widget<NitumeTopBar>(find.byType(NitumeTopBar));
    expect(top.greeting, greetingFor(DateTime.now()));
    expect(top.title, isEmpty);
    // CC-3: core InitialsAvatar shows the person glyph without a name.
    expect(find.byKey(const ValueKey('initials-avatar-glyph')), findsOneWidget);
  });

  testWidgets('x-merchant-payment: nothing due leaves the screen', (t) async {
    final b = TestBackend();
    await b.pumpScreen(
      t,
      Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const MerchantPaymentScreen(errandId: 'e1'),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.byType(MerchantPaymentScreen), findsNothing);
    expect(find.text('Nothing to pay right now.'), findsOneWidget);
    expect(
      find.textContaining("merchant's details aren't available"),
      findsNothing,
    );
  });
}
