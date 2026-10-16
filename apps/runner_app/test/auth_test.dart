import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/session.dart';

import 'support/fakes.dart';

NitumeApiException otpError(String code, {int status = 401, int? retry}) =>
    NitumeApiException(
      message: code,
      statusCode: status,
      code: code,
      details: {'retryAfterSeconds': ?retry},
    );

const _wrongAccount =
    'This number is registered as a customer account. '
    'Use another number, or contact support.';

Future<void> _toOtp(WidgetTester t, {String phone = '0733111222'}) async {
  await t.enterText(find.byType(TextField), phone);
  await t.tap(find.text('Send code'));
  await t.pumpAndSettle();
}

Future<void> _enterCode(WidgetTester t, String code) async {
  await t.enterText(find.byType(TextField).last, code);
  await t.pumpAndSettle();
}

void main() {
  group('v-auth-phone', () {
    testWidgets('shows the runner copy and validates the number', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);

      expect(find.text('Earn on your own schedule.'), findsOneWidget);
      expect(
        find.text('Enter your phone number to sign in or apply as a Runner.'),
        findsOneWidget,
      );
      expect(find.text('+254 7XX XXX XXX'), findsOneWidget);
      expect(find.text('Runner'), findsOneWidget);
      // Unconfigured legal links render as plain text.
      expect(find.text('Runner Terms'), findsOneWidget);
      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.byType(NitumeButton), findsOneWidget);

      await _toOtp(t, phone: '12345');
      expect(
        find.text('Enter a valid Kenyan number, e.g. +254 712 345 678'),
        findsOneWidget,
      );
      expect(b.auth.requested, isEmpty);
    });

    testWidgets('configured legal links are link buttons', (t) async {
      final opened = <Uri>[];
      final b = TestBackend(
        appConfig: AppConfig(
          termsUri: Uri.parse('https://nitume.example/runner-terms'),
          privacyUri: Uri.parse('https://nitume.example/privacy'),
          onOpenLink: (u) async {
            opened.add(u);
            return true;
          },
        ),
      );
      await b.pumpApp(t, signedIn: false);
      await t.tap(find.widgetWithText(NitumeButton, 'Runner Terms'));
      await t.pumpAndSettle();
      expect(opened, [Uri.parse('https://nitume.example/runner-terms')]);
    });

    testWidgets('send code normalizes the phone and opens OTP', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);

      expect(b.auth.requested, ['+254733111222']);
      expect(find.text('Enter the code'), findsOneWidget);
      expect(
        find.text(
          'We sent a 6-digit code to +254 733 111 222.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('Resend code in', findRichText: true),
        findsOneWidget,
      );
    });

    testWidgets('a cooldown goes to OTP silently', (t) async {
      final b = TestBackend();
      b.auth.requestError = otpError(
        'otp_resend_cooldown',
        status: 429,
        retry: 40,
      );
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      expect(find.text('Enter the code'), findsOneWidget);
    });

    testWidgets('rate limit shows the wait in minutes', (t) async {
      final b = TestBackend();
      b.auth.requestError = otpError(
        'otp_rate_limited',
        status: 429,
        retry: 125,
      );
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      expect(
        find.text(
          'Too many code requests. Try again in 3 min.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(find.text('Enter the code'), findsNothing);
    });

    testWidgets('send failure and network errors', (t) async {
      final b = TestBackend();
      b.auth.requestError = otpError('otp_delivery_failed', status: 502);
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      expect(
        find.text("We couldn't send the code. Try again.", findRichText: true),
        findsOneWidget,
      );

      b.auth.requestError = const NitumeApiException(
        message: 'offline',
        isNetworkError: true,
      );
      await t.tap(find.text('Send code'));
      await t.pumpAndSettle();
      expect(
        find.text('Check your connection and try again.', findRichText: true),
        findsOneWidget,
      );
    });
  });

  group('v-auth-otp', () {
    testWidgets('verifies as a runner; wrong code, then the shell', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);

      b.auth.verifyError = otpError('otp_incorrect');
      await _enterCode(t, '111111');
      expect(find.text('That code is incorrect. Try again.'), findsOneWidget);

      b.auth.verifyError = null;
      await _enterCode(t, '123456');
      expect(b.auth.verified, ['111111', '123456']);
      expect(b.auth.roles, everyElement(UserRole.runner));
      expect(b.services.session.status, SessionStatus.signedIn);
      expect(find.byType(RunnerShell), findsOneWidget);
      expect(b.push.registered, 1);
    });

    testWidgets('expired code disables verify until resend', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);

      b.auth.verifyError = otpError('otp_expired');
      await _enterCode(t, '111111');
      expect(
        find.text('This code has expired. Request a new code.'),
        findsOneWidget,
      );
      final verify = t.widget<NitumeButton>(
        find.widgetWithText(NitumeButton, 'Verify & continue'),
      );
      expect(verify.onPressed, isNull);

      await t.pump(const Duration(seconds: 61));
      await t.tap(find.text('Resend code'));
      await t.pumpAndSettle();
      expect(b.auth.requested.length, 2);
      expect(find.text('New code sent.'), findsOneWidget);
      expect(
        find.text('This code has expired. Request a new code.'),
        findsNothing,
      );
    });

    testWidgets('a customer account is refused and its tokens dropped', (
      t,
    ) async {
      final b = TestBackend(
        appConfig: AppConfig(
          supportUri: Uri.parse('https://wa.me/254700000000'),
          onOpenLink: (_) async => true,
        ),
      );
      b.auth.current = user(role: UserRole.customer);
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      await _enterCode(t, '123456');

      expect(find.text(_wrongAccount, findRichText: true), findsOneWidget);
      expect(find.text('Contact support'), findsOneWidget);
      expect(b.auth.logouts, 1);
      expect(b.auth.stored, isNull);
      expect(b.services.session.user, isNull);
      expect(find.byType(RunnerShell), findsNothing);
      expect(find.text('Enter the code'), findsOneWidget);
    });

    testWidgets('API role_mismatch shows the same refusal (RA-9)', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      b.auth.verifyError = otpError(roleMismatchCode, status: 403);
      await _enterCode(t, '123456');

      expect(find.text(_wrongAccount, findRichText: true), findsOneWidget);
      // No support link without a configured support URI.
      expect(find.text('Contact support'), findsNothing);
      expect(find.byType(RunnerShell), findsNothing);
    });

    testWidgets('a suspended account cannot sign in', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      b.auth.verifyError = otpError(
        ApiErrorCodes.accountSuspended,
        status: 403,
      );
      await _enterCode(t, '123456');
      expect(
        find.text(
          "This account can't sign in. Contact support.",
          findRichText: true,
        ),
        findsOneWidget,
      );
    });

    testWidgets('back returns to the phone screen', (t) async {
      final b = TestBackend();
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      await t.tap(find.byType(NitumeBackButton));
      await t.pumpAndSettle();
      expect(find.text('Earn on your own schedule.'), findsOneWidget);
    });
  });

  group('x-name-capture', () {
    testWidgets('first sign-in asks for the name, then the shell', (t) async {
      final b = TestBackend();
      b.auth.current = user(displayName: null);
      await b.pumpApp(t, signedIn: false);
      await _toOtp(t);
      await _enterCode(t, '123456');

      expect(find.text("What's your name?"), findsOneWidget);
      expect(
        find.text(
          'Use the name on your National ID. Customers see your first name '
          'and initial.',
        ),
        findsOneWidget,
      );
      expect(find.text('Your full name'), findsOneWidget);
      expect(find.byType(NitumeBackButton), findsNothing);
      final field = t.widget<TextField>(find.byType(TextField));
      expect(field.textCapitalization, TextCapitalization.words);

      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(find.text('Enter your name.'), findsOneWidget);

      await t.enterText(find.byType(TextField), 'x' * 61);
      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(find.text('Keep it under 60 characters.'), findsOneWidget);

      b.auth.nameError = const NitumeApiException(
        message: 'boom',
        statusCode: 500,
      );
      await t.enterText(find.byType(TextField), 'Brian Kamau');
      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(find.text("Couldn't save your name. Try again."), findsOneWidget);

      b.auth.nameError = null;
      await t.tap(find.text('Continue'));
      await t.pumpAndSettle();
      expect(b.auth.current.displayName, 'Brian Kamau');
      expect(find.byType(RunnerShell), findsOneWidget);
    });
  });

  group('session restore', () {
    testWidgets('a stored runner session restores into Jobs', (t) async {
      final b = TestBackend();
      await b.pumpApp(t);
      expect(find.byType(RunnerShell), findsOneWidget);
      expect(t.widget<NitumeTabBar>(find.byType(NitumeTabBar)).currentIndex, 0);
    });

    testWidgets('a stored customer session is dropped with a notice', (
      t,
    ) async {
      final b = TestBackend();
      b.auth.current = user(role: UserRole.customer);
      await b.pumpApp(t);
      expect(find.text('Earn on your own schedule.'), findsOneWidget);
      expect(find.text(_wrongAccount), findsOneWidget); // snackbar
      expect(b.auth.stored, isNull);
    });

    testWidgets('restore offline offers a retry', (t) async {
      final b = TestBackend();
      b.auth.currentError = const NitumeApiException(
        message: 'offline',
        isNetworkError: true,
      );
      await b.pumpApp(t);
      expect(find.text('Check your connection and try again.'), findsOneWidget);

      b.auth.currentError = null;
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(find.byType(RunnerShell), findsOneWidget);
    });

    testWidgets('log out returns to the phone screen', (t) async {
      final b = TestBackend();
      await b.pumpApp(t);
      await b.services.session.logout();
      await t.pumpAndSettle();
      expect(find.text('Earn on your own schedule.'), findsOneWidget);
      expect(b.push.unregistered, 1);
    });
  });
}
