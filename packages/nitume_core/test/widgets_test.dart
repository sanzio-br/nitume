import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

Color? _boxColor(WidgetTester tester, Finder f) {
  final box = tester.widget<Container>(f);
  return (box.decoration as BoxDecoration?)?.color;
}

Color? _borderColor(WidgetTester tester, Finder f) {
  final box = tester.widget<Container>(f);
  final border = (box.decoration as BoxDecoration?)?.border as Border?;
  return border?.top.color;
}

void main() {
  group('statusPresentation', () {
    test('covers every state with the §6 labels', () {
      for (final s in ErrandStatus.values) {
        expect(statusPresentation(s).label, isNotEmpty);
      }
      expect(statusPresentation(ErrandStatus.requested).label, 'Awaiting quote');
      expect(statusPresentation(ErrandStatus.settled).label, 'Completed');
      expect(statusPresentation(ErrandStatus.disputed).tone, StatusTone.danger);
      expect(statusPresentation(ErrandStatus.failed).tone, StatusTone.danger);
      expect(statusPresentation(ErrandStatus.completed).tone,
          StatusTone.success);
    });

    test('shows system-only CONFIRMED and SETTLED as Completed (row 35)', () {
      for (final s in [ErrandStatus.confirmed, ErrandStatus.settled]) {
        expect(statusPresentation(s),
            (label: 'Completed', tone: StatusTone.success));
      }
      for (final s in ErrandStatus.values) {
        expect(statusPresentation(s).label, isNot('Confirmed'));
      }
    });

    test('applies the owner Q13 tones', () {
      expect(statusPresentation(ErrandStatus.runnerEnRoute),
          (label: 'En route', tone: StatusTone.pending));
      expect(statusPresentation(ErrandStatus.cancelled),
          (label: 'Cancelled', tone: StatusTone.danger));
      expect(statusPresentation(ErrandStatus.runnerAssigned).tone,
          StatusTone.info);
      expect(statusPresentation(ErrandStatus.arrived).tone, StatusTone.info);
      expect(statusPresentation(ErrandStatus.inProgress).tone, StatusTone.info);
    });

    test('red and amber accents follow the owner decisions', () {
      expect(NitumeDesignChoices.unreadDot, NitumeColors.red);
      expect(NitumeDesignChoices.destructiveText, NitumeColors.red);
      expect(NitumeDesignChoices.fieldError, NitumeColors.red);
      expect(NitumeDesignChoices.priceChangeAmount, NitumeColors.amber);
      expect(NitumeDesignChoices.buttonRadius, NitumeRadii.pill);
      expect(NitumeDesignChoices.fieldFill, NitumeColors.white);
      expect(NitumeDesignChoices.fieldRadius, NitumeRadii.small);
    });
  });

  group('StatusChip', () {
    testWidgets('uses exact design-system tones and a dot', (tester) async {
      await pumpThemed(
        tester,
        const StatusChip(label: 'Completed', tone: StatusTone.success),
      );
      expect(find.text('Completed'), findsOneWidget);
      final text = tester.widget<Text>(find.text('Completed'));
      expect(text.style?.color, NitumeColors.green700);
      expect(text.style?.fontSize, 12);
      expect(find.byKey(const ValueKey('status-chip-dot')), findsOneWidget);
      final box = tester.widget<DecoratedBox>(
        find.descendant(
          of: find.byType(StatusChip),
          matching: find.byType(DecoratedBox),
        ).first,
      );
      final deco = box.decoration as BoxDecoration;
      expect(deco.color, NitumeColors.green050);
      expect(deco.borderRadius, BorderRadius.circular(NitumeRadii.pill));
    });

    testWidgets('forStatus maps state to label', (tester) async {
      await pumpThemed(tester, StatusChip.forStatus(ErrandStatus.quoted));
      expect(find.text('Quote ready'), findsOneWidget);
    });

    testWidgets('tag size has no dot', (tester) async {
      await pumpThemed(
        tester,
        const StatusChip(
          label: 'Default',
          tone: StatusTone.info,
          size: StatusChipSize.tag,
        ),
      );
      expect(find.byKey(const ValueKey('status-chip-dot')), findsNothing);
      expect(tester.widget<Text>(find.text('Default')).style?.fontSize, 10);
    });

    testWidgets('numeric suffix renders in Fira Code', (tester) async {
      await pumpThemed(
        tester,
        const StatusChip(
          label: 'Check It For Me',
          numericSuffix: '#10482',
          tone: StatusTone.info,
          size: StatusChipSize.compact,
        ),
      );
      final rich = tester.widget<RichText>(
        find.descendant(
          of: find.byType(StatusChip),
          matching: find.byType(RichText),
        ),
      );
      TextSpan? number;
      rich.text.visitChildren((span) {
        if (span is TextSpan && span.text == '#10482') number = span;
        return true;
      });
      expect(number, isNotNull);
      expect(number!.style?.fontFamily, NitumeTypography.numericFamily);
    });
  });

  group('NumText', () {
    testWidgets('kes formats and uses Fira Code', (tester) async {
      await pumpThemed(tester, NumText.kes('2200.00'));
      final text = tester.widget<Text>(find.text('KSh 2,200'));
      expect(text.style?.fontFamily, NitumeTypography.numericFamily);
    });
  });

  group('StepProgressBar', () {
    testWidgets('colours completed segments green', (tester) async {
      await pumpThemed(
        tester,
        const StepProgressBar(total: 3, completed: 2),
      );
      expect(_boxColor(tester, find.byKey(const ValueKey('step-segment-0'))),
          NitumeColors.green);
      expect(_boxColor(tester, find.byKey(const ValueKey('step-segment-1'))),
          NitumeColors.green);
      expect(_boxColor(tester, find.byKey(const ValueKey('step-segment-2'))),
          NitumeColors.slateLine);
      expect(find.bySemanticsLabel('Step 2 of 3'), findsOneWidget);
    });
  });

  group('StatusTimeline', () {
    testWidgets('renders steps with done and pending dots', (tester) async {
      await pumpThemed(
        tester,
        const StatusTimeline(
          steps: [
            TimelineStep(title: 'Runner assigned', time: '10:03 AM', done: true),
            TimelineStep(title: 'En route', time: '10:12 AM', done: true),
            TimelineStep(title: 'Arrived', time: 'Expected 10:28 AM'),
          ],
        ),
      );
      expect(find.text('Runner assigned'), findsOneWidget);
      expect(find.byKey(const ValueKey('timeline-dot-done')), findsNWidgets(2));
      expect(find.byKey(const ValueKey('timeline-dot-pending')), findsOneWidget);
      final time = tester.widget<Text>(find.text('Expected 10:28 AM'));
      expect(time.style?.fontFamily, NitumeTypography.numericFamily);
      expect(_boxColor(tester,
              find.byKey(const ValueKey('timeline-dot-pending'))),
          NitumeColors.slate400);
    });
  });

  group('OTP error and resend states', () {
    testWidgets('errorText turns boxes red and shows the message',
        (tester) async {
      await pumpThemed(
        tester,
        const OtpCodeField(
          errorText: 'That code is incorrect or has expired.',
        ),
      );
      expect(_borderColor(tester, find.byKey(const ValueKey('otp-box-0'))),
          NitumeColors.red);
      final error = tester.widget<Text>(find.byKey(const ValueKey('otp-error')));
      expect(error.data, 'That code is incorrect or has expired.');
      expect(error.style?.color, NitumeColors.red);
    });

    testWidgets('ResendCooldown counts 60s down to the resend link',
        (tester) async {
      final cooldown = ResendCooldown();
      addTearDown(cooldown.dispose);
      var resends = 0;
      await pumpThemed(
        tester,
        ListenableBuilder(
          listenable: cooldown,
          builder: (_, _) => OtpResendLine(
            secondsRemaining: cooldown.secondsRemaining,
            onResend: () => resends++,
          ),
        ),
      );
      expect(find.text('Resend code'), findsOneWidget);

      cooldown.start();
      await tester.pump();
      expect(cooldown.secondsRemaining, 60);
      expect(find.byKey(const ValueKey('otp-resend-countdown')),
          findsOneWidget);
      expect(find.text('Resend code'), findsNothing);
      final countdown = tester.widget<Text>(
        find.byKey(const ValueKey('otp-resend-countdown')),
      );
      final span = (countdown.textSpan! as TextSpan).children!.single
          as TextSpan;
      expect(span.text, '1:00');
      expect(span.style?.fontFamily, NitumeTypography.numericFamily);

      await tester.pump(const Duration(seconds: 18));
      expect(cooldown.secondsRemaining, 42);

      await tester.pump(const Duration(seconds: 42));
      expect(cooldown.isActive, isFalse);
      await tester.tap(find.text('Resend code'));
      expect(resends, 1);
    });

    test('OtpPolicy matches the owner decision (Q17)', () {
      expect(OtpPolicy.codeLength, 6);
      expect(OtpPolicy.expiry, const Duration(minutes: 5));
      expect(OtpPolicy.maxAttempts, 5);
      expect(OtpPolicy.resendCooldown, const Duration(seconds: 60));
      expect(OtpPolicy.maxRequestsPerHour, 5);
    });

    test('OtpErrorKind classifies the API OTP errors', () {
      OtpErrorKind? kind(int status, String message) =>
          OtpErrorKind.fromApiException(
            NitumeApiException(message: message, statusCode: status),
          );
      expect(kind(401, 'Incorrect verification code.'),
          OtpErrorKind.incorrect);
      expect(kind(401, 'No active verification code. Request a new one.'),
          OtpErrorKind.expired);
      expect(kind(401, 'Too many incorrect attempts. Request a new code.'),
          OtpErrorKind.attemptsExhausted);
      expect(kind(429, 'Please wait 60s before requesting another code.'),
          OtpErrorKind.resendTooSoon);
      expect(kind(429, 'Too many OTP requests. Try again in a few minutes.'),
          OtpErrorKind.requestLimitReached);
      expect(kind(500, 'Something went wrong.'), isNull);
      expect(OtpErrorKind.expired.requiresNewCode, isTrue);
      expect(OtpErrorKind.attemptsExhausted.requiresNewCode, isTrue);
      expect(OtpErrorKind.incorrect.requiresNewCode, isFalse);
      expect(OtpErrorKind.notRequested.requiresNewCode, isTrue);
    });

    test('OtpErrorKind prefers the API code over the message', () {
      OtpErrorKind? kind(String code, {int status = 401}) =>
          OtpErrorKind.fromApiException(
            NitumeApiException(
              message: 'Please wait',
              statusCode: status,
              code: code,
            ),
          );
      expect(kind('otp_incorrect'), OtpErrorKind.incorrect);
      expect(kind('otp_expired'), OtpErrorKind.expired);
      expect(kind('otp_attempts_exhausted'), OtpErrorKind.attemptsExhausted);
      expect(kind('otp_not_requested'), OtpErrorKind.notRequested);
      expect(kind('otp_resend_cooldown', status: 429),
          OtpErrorKind.resendTooSoon);
      expect(kind('otp_rate_limited', status: 429),
          OtpErrorKind.requestLimitReached);
      expect(kind('otp_delivery_failed', status: 400),
          OtpErrorKind.deliveryFailed);
      expect(kind('idempotency_key_reused', status: 409), isNull);
    });
  });

  group('OtpCodeField', () {
    testWidgets('fills boxes and completes on the sixth digit',
        (tester) async {
      String? completed;
      final changes = <String>[];
      await pumpThemed(
        tester,
        OtpCodeField(onChanged: changes.add, onCompleted: (c) => completed = c),
      );
      await tester.enterText(find.byKey(const ValueKey('otp-input')), '123');
      await tester.pump();
      expect(_borderColor(tester, find.byKey(const ValueKey('otp-box-0'))),
          NitumeColors.green);
      expect(_borderColor(tester, find.byKey(const ValueKey('otp-box-3'))),
          NitumeColors.slateLine);
      expect(completed, isNull);

      await tester.enterText(find.byKey(const ValueKey('otp-input')), '123456');
      await tester.pump();
      expect(completed, '123456');
      expect(changes.last, '123456');
    });

    testWidgets('ignores non-digits and caps length', (tester) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);
      await pumpThemed(tester, OtpCodeField(controller: controller));
      await tester.enterText(
        find.byKey(const ValueKey('otp-input')),
        '12a3456789',
      );
      await tester.pump();
      expect(controller.text.length, lessThanOrEqualTo(6));
      expect(RegExp(r'^\d*$').hasMatch(controller.text), isTrue);
    });
  });

  group('StarRatingInput', () {
    testWidgets('taps set the value; stars have 48dp targets',
        (tester) async {
      var value = 0;
      await pumpThemed(
        tester,
        StatefulBuilder(
          builder: (context, setState) => StarRatingInput(
            value: value,
            onChanged: (v) => setState(() => value = v),
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('star-4')));
      await tester.pump();
      expect(value, 4);
      final icons = tester.widgetList<Icon>(find.byType(Icon)).toList();
      expect(icons.where((i) => i.color == NitumeColors.green), hasLength(4));
      expect(icons.where((i) => i.color == NitumeColors.slateLine),
          hasLength(1));
      expect(tester.getSize(find.byKey(const ValueKey('star-1'))),
          const Size(48, 48));
    });

    testWidgets('read-only when onChanged is null', (tester) async {
      await pumpThemed(
        tester,
        const StarRatingInput(value: 3, onChanged: null),
      );
      await tester.tap(find.byKey(const ValueKey('star-5')));
      await tester.pump();
      final icons = tester.widgetList<Icon>(find.byType(Icon)).toList();
      expect(icons.where((i) => i.color == NitumeColors.green), hasLength(3));
    });
  });

  group('NitumeButton', () {
    testWidgets('primary is green with white text, loading disables',
        (tester) async {
      var taps = 0;
      await pumpThemed(
        tester,
        Column(
          children: [
            NitumeButton.primary(label: 'Send code', onPressed: () => taps++),
            NitumeButton.secondary(
              label: 'Busy',
              onPressed: () => taps++,
              loading: true,
            ),
          ],
        ),
      );
      await tester.tap(find.text('Send code'));
      expect(taps, 1);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final button = tester.widget<FilledButton>(find.byType(FilledButton).last);
      expect(button.onPressed, isNull);
    });
  });

  group('NitumeTabBar', () {
    testWidgets('shows all labels, active green-700', (tester) async {
      int? tapped;
      await pumpThemed(
        tester,
        Align(
          alignment: Alignment.bottomCenter,
          child: NitumeTabBar(
            currentIndex: 0,
            onTap: (i) => tapped = i,
            items: const [
              NitumeTabItem(icon: Icons.home_outlined, label: 'Home'),
              NitumeTabItem(icon: Icons.add_circle_outline, label: 'New task'),
              NitumeTabItem(icon: Icons.visibility_outlined, label: 'Track'),
            ],
          ),
        ),
      );
      expect(tester.widget<Text>(find.text('Home')).style?.color,
          NitumeColors.green700);
      expect(tester.widget<Text>(find.text('Track')).style?.color,
          NitumeColors.slate400);
      await tester.tap(find.text('New task'));
      expect(tapped, 1);
    });
  });

  group('NotificationBell', () {
    testWidgets('dot only when unread, labelled', (tester) async {
      await pumpThemed(
        tester,
        NotificationBell(unreadCount: 2, onPressed: () {}),
      );
      expect(find.byKey(const ValueKey('bell-unread-dot')), findsOneWidget);
      expect(
        _boxColor(tester, find.byKey(const ValueKey('bell-unread-dot'))),
        NitumeColors.red,
      );
      expect(find.bySemanticsLabel('Notifications, 2 unread'), findsOneWidget);
      expect(tester.getSize(find.byType(NotificationBell)),
          const Size(48, 48));
    });
  });

  group('PaymentMethodCard', () {
    testWidgets('green M-PESA badge with white text, Fira Code detail',
        (tester) async {
      await pumpThemed(
        tester,
        PaymentMethodCard(
          label: 'M-Pesa',
          detail: '+254 712 ••• 678',
          onTap: () {},
        ),
      );
      final badge = find.ancestor(
        of: find.text('M-PESA'),
        matching: find.byType(Container),
      );
      expect(_boxColor(tester, badge.first), NitumeColors.green);
      expect(tester.widget<Text>(find.text('M-PESA')).style?.color,
          NitumeColors.white);
      expect(
        tester.widget<Text>(find.text('+254 712 ••• 678')).style?.fontFamily,
        NitumeTypography.numericFamily,
      );
      expect(find.text('VISA'), findsNothing);
    });
  });

  group('CategoryGrid', () {
    testWidgets('shows the five MVP display names and reports selection',
        (tester) async {
      ErrandCategory? picked;
      await pumpThemed(
        tester,
        CategoryGrid(
          selected: ErrandCategory.checkItForMe,
          onSelected: (c) => picked = c,
        ),
      );
      for (final c in mvpCustomerCategories) {
        expect(find.text(c.label), findsOneWidget);
      }
      expect(find.text('Business Tasks'), findsNothing);
      await tester.tap(find.text('Wait For Me'));
      expect(picked, ErrandCategory.waitForMe);
    });

    test('full display names; Business Tasks kept but not in MVP list', () {
      expect(ErrandCategory.values.map((c) => c.label), [
        'Buy For Me',
        'Get It For Me',
        'Check It For Me',
        'Go There For Me',
        'Wait For Me',
        'Business Tasks',
      ]);
      expect(mvpCustomerCategories, hasLength(5));
      expect(mvpCustomerCategories,
          isNot(contains(ErrandCategory.businessTasks)));
      expect(ErrandCategory.fromWire('business'), ErrandCategory.businessTasks);
    });
  });

  group('NitumePushedHeader', () {
    testWidgets('step counter in Fira Code and back pops', (tester) async {
      var backs = 0;
      await pumpThemed(
        tester,
        NitumePushedHeader(
          title: 'New task',
          step: 1,
          totalSteps: 3,
          onBack: () => backs++,
        ),
      );
      final step = tester.widget<Text>(find.text('Step 1 of 3'));
      expect(step.style?.fontFamily, NitumeTypography.numericFamily);
      await tester.tap(find.byType(NitumeBackButton));
      expect(backs, 1);
    });
  });

  group('ReceiptCard / TaskHistoryCard', () {
    testWidgets('amounts formatted, missing as em dash', (tester) async {
      await pumpThemed(
        tester,
        Column(
          children: [
            const ReceiptCard(
              rows: [
                ReceiptRow(label: 'Service fee', amount: '700.00'),
                ReceiptRow(label: 'Total paid', amount: '2200.00', isTotal: true),
              ],
            ),
            TaskHistoryCard(
              title: 'NTSA queue',
              status: StatusChip.forStatus(ErrandStatus.cancelled),
            ),
          ],
        ),
      );
      expect(find.text('KSh 700'), findsOneWidget);
      expect(find.text('KSh 2,200'), findsOneWidget);
      expect(find.text('—'), findsNWidgets(2));
    });
  });
}
