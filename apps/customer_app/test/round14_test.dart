import 'package:customer_app/src/screens/account/notifications_screen.dart';
import 'package:customer_app/src/screens/checkout/awaiting_quote_screen.dart';
import 'package:customer_app/src/screens/checkout/payment_screen.dart';
import 'package:customer_app/src/screens/wizard/details_screen.dart';
import 'package:customer_app/src/screens/wizard/task_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Quote _quote(DateTime? expiresAt) => Quote(
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

const _caption =
    "No fixed time. Your task's deadline is 24 hours after your payment is "
    'confirmed.';
const _outsideNotice =
    "We don't cover this location yet. Choose a place inside the areas we "
    'serve.';
const _noDeadline =
    'No deadline yet. It starts when your payment is confirmed.';
const _passedNotice = 'Your deadline has passed. Choose a new one to continue.';

const _outside = NitumeApiException(
  message: 'server text never shown',
  statusCode: 422,
  code: ApiErrorCodes.locationOutsideServiceArea,
  details: {'pointType': 'task_site'},
);

const _deadlinePassed = NitumeApiException(
  message: 'server text never shown',
  statusCode: 409,
  code: ApiErrorCodes.deadlinePassedBeforePayment,
);

const _place = DraftPlace(addressText: 'Links Road, Nyali', lat: -4, lng: 39);
const _otherPlace = DraftPlace(addressText: 'Kilimani Rd', lat: -1, lng: 36);

TaskDraft _draft() => TaskDraft(category: ErrandCategory.checkItForMe)
  ..description = 'Check the flat and film it'
  ..first = _place;

/// The Fira Code span holding [text] inside a rich text.
TextSpan? _numSpan(WidgetTester t, String text) {
  for (final rt in t.widgetList<RichText>(find.byType(RichText))) {
    TextSpan? hit;
    rt.text.visitChildren((s) {
      if (s is TextSpan && s.text == text) {
        hit = s;
        return false;
      }
      return true;
    });
    if (hit != null) return hit;
  }
  return null;
}

NitumeButton _button(WidgetTester t, String label) =>
    t.widget<NitumeButton>(find.widgetWithText(NitumeButton, label));

void main() {
  group('C-12-1 v-new-details Flexible caption', () {
    testWidgets('shown only for Flexible, duration in Fira Code', (t) async {
      final b = TestBackend();
      await b.pumpScreen(t, DetailsScreen(draft: _draft()));
      expect(find.textContaining('No fixed time.'), findsNothing);

      await t.tap(find.text('Flexible'));
      await t.pumpAndSettle();
      expect(find.text(_caption, findRichText: true), findsOneWidget);
      expect(
        _numSpan(t, '24 hours')?.style?.fontFamily,
        NitumeTypography.numericFamily,
      );

      await t.tap(find.text('Tomorrow'));
      await t.pumpAndSettle();
      expect(find.textContaining('No fixed time.'), findsNothing);
    });

    testWidgets('hidden when the API sends no default', (t) async {
      final b = TestBackend();
      b.errands.defaultsValue = const ErrandDefaults();
      await b.pumpScreen(t, DetailsScreen(draft: _draft()));
      await t.tap(find.text('Flexible'));
      await t.pumpAndSettle();
      expect(find.textContaining('No fixed time.'), findsNothing);
    });

    testWidgets('hidden when the clock start is unknown', (t) async {
      final b = TestBackend();
      b.errands.defaultsValue = const ErrandDefaults(defaultDeadlineHours: 24);
      await b.pumpScreen(t, DetailsScreen(draft: _draft()));
      await t.tap(find.text('Flexible'));
      await t.pumpAndSettle();
      expect(find.textContaining('No fixed time.'), findsNothing);
    });

    testWidgets('hidden when the defaults call fails', (t) async {
      final b = TestBackend();
      b.errands.defaultsError = const NitumeApiException(message: 'x');
      await b.pumpScreen(t, DetailsScreen(draft: _draft()));
      await t.tap(find.text('Flexible'));
      await t.pumpAndSettle();
      expect(find.textContaining('No fixed time.'), findsNothing);
    });
  });

  group('C-14-1 v-new-review outside every service area', () {
    testWidgets('notice + Change location; submit waits for a new place', (
      t,
    ) async {
      final b = TestBackend();
      b.errands.createError = _outside;
      final draft = _draft();
      await b.pumpScreen(t, DetailsScreen(draft: draft));
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      await t.tap(find.text('Submit task →'));
      await t.pumpAndSettle();

      expect(find.text(_outsideNotice), findsOneWidget);
      expect(find.text('server text never shown'), findsNothing);
      expect(find.byType(SnackBar), findsNothing);
      expect(_button(t, 'Submit task →').onPressed, isNull);
      expect(b.errands.submitted, isEmpty);

      await t.tap(find.text('Change location'));
      await t.pumpAndSettle();
      expect(find.text('Task details'), findsOneWidget);

      // Same place: still refused.
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      expect(find.text(_outsideNotice), findsOneWidget);
      expect(_button(t, 'Submit task →').onPressed, isNull);

      // Another place: submit is allowed again and creates the task.
      t.state<NavigatorState>(find.byType(Navigator)).pop();
      await t.pumpAndSettle();
      draft.first = _otherPlace;
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      expect(find.text(_outsideNotice), findsNothing);
      await t.tap(find.text('Submit task →'));
      await t.pumpAndSettle();
      expect(b.errands.created, hasLength(2));
      expect(b.errands.submitted, ['new1']);
    });

    testWidgets('refused at submit: the draft is cancelled, not reused', (
      t,
    ) async {
      final b = TestBackend();
      b.errands.submitError = _outside;
      final draft = _draft();
      await b.pumpScreen(t, DetailsScreen(draft: draft));
      await t.tap(find.text('Continue →'));
      await t.pumpAndSettle();
      await t.tap(find.text('Submit task →'));
      await t.pumpAndSettle();

      expect(find.text(_outsideNotice), findsOneWidget);
      expect(b.errands.transitions, [('new1', ErrandStatus.cancelled)]);
      expect(draft.createdErrandId, isNull);
    });
  });

  group('C-14-3 / C-15-1 x-awaiting-quote deadline', () {
    Future<TestBackend> open(
      WidgetTester t, {
      DateTime? deadlineAt,
      bool deadlinePassed = false,
    }) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: ErrandStatus.quoted,
          quotedPrice: '2200.00',
          withRunner: false,
          deadlineAt: deadlineAt,
        ),
      );
      await b.pumpScreen(
        t,
        AwaitingQuoteScreen(errandId: 'e1', deadlinePassed: deadlinePassed),
      );
      return b;
    }

    testWidgets('Flexible: no deadline yet, Change → Tomorrow', (t) async {
      final b = await open(t);
      expect(find.text('Deadline'), findsOneWidget);
      expect(find.text(_noDeadline), findsOneWidget);
      expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);

      await t.tap(find.widgetWithText(NitumeButton, 'Change'));
      await t.pumpAndSettle();
      expect(find.text('Tomorrow'), findsOneWidget);
      expect(find.text('Flexible'), findsOneWidget);
      // The current choice is selected; its caption is shown.
      expect(
        t
            .widget<NitumeChoiceChip>(
              find.widgetWithText(NitumeChoiceChip, 'Flexible'),
            )
            .selected,
        isTrue,
      );
      expect(find.text(_caption, findRichText: true), findsOneWidget);

      await t.tap(find.text('Tomorrow'));
      await t.pumpAndSettle();
      final now = DateTime.now();
      final (id, at) = b.errands.deadlines.single;
      expect(id, 'e1');
      expect(at, DateTime(now.year, now.month, now.day + 1, 23, 59));
      expect(find.text(_noDeadline), findsNothing);
      expect(find.text(formatDayTimeEat(at!)), findsOneWidget);
      // The quote is kept (row 242): same CTA, no new quote call.
      expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);
      expect(b.errands.quoteRequests, isEmpty);
    });

    testWidgets('passed on load: notice, new deadline, Flexible clears it', (
      t,
    ) async {
      final b = await open(
        t,
        deadlineAt: DateTime.now().subtract(const Duration(hours: 1)),
      );
      expect(find.text(_passedNotice), findsOneWidget);
      expect(find.textContaining('Confirm & pay'), findsNothing);
      expect(find.widgetWithText(NitumeButton, 'Change'), findsNothing);

      await t.tap(find.text('Choose a new deadline'));
      await t.pumpAndSettle();
      await t.tap(find.text('Flexible'));
      await t.pumpAndSettle();

      expect(b.errands.deadlines.single, ('e1', null));
      expect(find.text(_passedNotice), findsNothing);
      expect(find.text(_noDeadline), findsOneWidget);
      expect(find.text('Confirm & pay KSh 2,200 →'), findsOneWidget);
    });

    testWidgets('payment refusal pops back to the new-deadline state', (
      t,
    ) async {
      final future = DateTime.now().add(const Duration(hours: 3));
      final b = await open(t, deadlineAt: future);
      b.payments.initiateError = _deadlinePassed;
      await t.tap(find.text('Confirm & pay KSh 2,200 →'));
      await t.pumpAndSettle();

      expect(find.byType(PaymentScreen), findsNothing);
      expect(find.byType(AwaitingQuoteScreen), findsOneWidget);
      expect(find.text(_passedNotice), findsOneWidget);
      expect(find.text('Choose a new deadline'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      expect(find.text('server text never shown'), findsNothing);
    });

    testWidgets('opened after a refusal (no checkout below)', (t) async {
      await open(
        t,
        deadlineAt: DateTime.now().add(const Duration(hours: 3)),
        deadlinePassed: true,
      );
      expect(find.text(_passedNotice), findsOneWidget);
      expect(find.text('Choose a new deadline'), findsOneWidget);
    });

    testWidgets('save error stays in the sheet with a retry', (t) async {
      final b = await open(t);
      b.errands.deadlineError = const NitumeApiException(
        message: 'server text never shown',
        statusCode: 400,
        code: ApiErrorCodes.deadlineInPast,
      );
      await t.tap(find.widgetWithText(NitumeButton, 'Change'));
      await t.pumpAndSettle();
      await t.tap(find.text('Tomorrow'));
      await t.pumpAndSettle();
      expect(find.text("Couldn't change the deadline. Try again."), findsOne);
      expect(find.text('server text never shown'), findsNothing);
      expect(find.text(_noDeadline), findsOneWidget);
    });

    testWidgets('paid meanwhile: reload routes away', (t) async {
      final b = await open(t);
      b.errands.deadlineError = const NitumeApiException(
        message: 'x',
        statusCode: 409,
        code: ApiErrorCodes.deadlineNotEditable,
      );
      await t.tap(find.widgetWithText(NitumeButton, 'Change'));
      await t.pumpAndSettle();
      b.errands.put(errand(status: ErrandStatus.cancelled, withRunner: false));
      await t.tap(find.text('Tomorrow'));
      await t.pumpAndSettle();
      expect(find.byType(AwaitingQuoteScreen), findsNothing);
    });
  });

  group('C-14-2 x-awaiting-quote outside every service area', () {
    const heading = "We can't take this task";
    const body =
        "Its location is outside the areas we serve. You can cancel it; you "
        "haven't paid anything.";

    final past = DateTime.now().subtract(const Duration(minutes: 5));
    final future = DateTime.now().add(const Duration(hours: 24));

    Future<TestBackend> open(
      WidgetTester t,
      ErrandStatus status, {
      bool flag = true,
      DateTime? quoteExpiresAt,
      DateTime? errandQuoteExpiresAt,
    }) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: status,
          quotedPrice: '2200.00',
          withRunner: false,
          quoteExpiresAt: errandQuoteExpiresAt,
          outsideServiceArea: flag,
        ),
      );
      if (status != ErrandStatus.requested) {
        b.errands.quoteValue = _quote(quoteExpiresAt);
      }
      await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
      return b;
    }

    // Row 249 (b): REQUESTED, or QUOTED / ACCEPTED with the quote expired.
    final shownCases = <(String, ErrandStatus, DateTime?, DateTime?)>[
      ('requested', ErrandStatus.requested, null, null),
      ('quoted, quote expired', ErrandStatus.quoted, past, null),
      ('accepted, quote expired', ErrandStatus.accepted, past, null),
      (
        'accepted, errand quoteExpiresAt passed',
        ErrandStatus.accepted,
        null,
        past,
      ),
    ];
    for (final (name, status, quoteAt, errandAt) in shownCases) {
      testWidgets('$name + flag: owner copy and Cancel task primary', (
        t,
      ) async {
        final b = await open(
          t,
          status,
          quoteExpiresAt: quoteAt,
          errandQuoteExpiresAt: errandAt,
        );
        expect(find.text(heading), findsOneWidget);
        expect(find.text(body), findsOneWidget);
        expect(find.text('Preparing your quote'), findsNothing);
        expect(find.textContaining('Confirm & pay'), findsNothing);
        expect(find.text('Request a new quote'), findsNothing);
        expect(find.byType(PulsingDots), findsNothing);
        // Chip only where it is still true (REQUESTED → Awaiting quote).
        expect(
          find.byType(StatusChip),
          status == ErrandStatus.requested ? findsOneWidget : findsNothing,
        );
        final cancel = find.widgetWithText(NitumeButton, 'Cancel task');
        expect(
          t.widget<NitumeButton>(cancel).variant,
          NitumeButtonVariant.primary,
        );

        await t.tap(cancel);
        await t.pumpAndSettle();
        expect(find.text('Cancel this task?'), findsOneWidget);
        await t.tap(find.widgetWithText(NitumeButton, 'Cancel task').last);
        // The pumped screen is the root here, so its spinner keeps running.
        await t.pump();
        await t.pump(const Duration(milliseconds: 500));
        expect(b.errands.transitions, [('e1', ErrandStatus.cancelled)]);
      });
    }

    for (final status in [ErrandStatus.quoted, ErrandStatus.accepted]) {
      testWidgets('${status.wire}, valid quote + stale flag: checkout', (
        t,
      ) async {
        await open(t, status, quoteExpiresAt: future);
        expect(find.text(heading), findsNothing);
        expect(find.textContaining('Confirm & pay'), findsWidgets);
        expect(find.text('Request a new quote'), findsNothing);
      });
    }

    testWidgets('API said quote_expired + flag: shown', (t) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: ErrandStatus.quoted,
          quotedPrice: '2200.00',
          withRunner: false,
          outsideServiceArea: true,
        ),
      );
      b.errands.quoteValue = _quote(future);
      await b.pumpScreen(
        t,
        const AwaitingQuoteScreen(errandId: 'e1', quoteExpired: true),
      );
      expect(find.text(heading), findsOneWidget);
    });

    testWidgets('quoted, no expiry + flag: checkout', (t) async {
      await open(t, ErrandStatus.quoted);
      expect(find.text(heading), findsNothing);
      expect(find.textContaining('Confirm & pay'), findsWidgets);
    });

    final noFlagCases = <(String, ErrandStatus, DateTime?)>[
      ('requested', ErrandStatus.requested, null),
      ('quoted, valid quote', ErrandStatus.quoted, future),
      ('quoted, quote expired', ErrandStatus.quoted, past),
      ('accepted, valid quote', ErrandStatus.accepted, future),
      ('accepted, quote expired', ErrandStatus.accepted, past),
    ];
    for (final (name, status, quoteAt) in noFlagCases) {
      testWidgets('$name, flag false: not shown', (t) async {
        await open(t, status, flag: false, quoteExpiresAt: quoteAt);
        expect(find.text(heading), findsNothing);
        expect(find.text(body), findsNothing);
        if (status == ErrandStatus.requested) {
          expect(find.text('Preparing your quote'), findsOneWidget);
        } else if (quoteAt == past) {
          expect(find.text('Request a new quote'), findsOneWidget);
        } else {
          expect(find.textContaining('Confirm & pay'), findsWidgets);
        }
      });
    }
  });

  group('v-notifications service_area.outside', () {
    testWidgets('opens x-awaiting-quote', (t) async {
      final b = TestBackend();
      b.errands.put(
        errand(
          status: ErrandStatus.requested,
          withRunner: false,
          outsideServiceArea: true,
        ),
      );
      b.notifications.items = [
        AppNotification(
          id: 'n1',
          eventType: NotificationEventType.outsideServiceAreaWire,
          title: "We can't take this task",
          body:
              'Its location is outside the areas we serve. You can cancel '
              "it; you haven't paid anything.",
          errandId: 'e1',
          isRead: false,
          createdAt: DateTime.now(),
        ),
      ];
      await b.pumpScreen(t, const NotificationsScreen());
      expect(find.byIcon(Icons.wrong_location_outlined), findsOneWidget);
      await t.tap(find.text("We can't take this task"));
      await t.pumpAndSettle();
      expect(find.byType(AwaitingQuoteScreen), findsOneWidget);
    });
  });
}
