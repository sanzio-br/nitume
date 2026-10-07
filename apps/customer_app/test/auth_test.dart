import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

NitumeApiException otpError(String code, {int status = 401, int? retry}) =>
    NitumeApiException(
      message: code,
      statusCode: status,
      code: code,
      details: {'retryAfterSeconds': ?retry},
    );

void main() {
  testWidgets('signed out: phone screen validates the number', (t) async {
    final b = TestBackend();
    await b.pumpApp(t, signedIn: false);

    expect(find.text("Someone there, when you can't be."), findsOneWidget);
    await t.enterText(find.byType(TextField), '12345');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();
    expect(
      find.text('Enter a valid Kenyan number, e.g. +254 712 345 678'),
      findsOneWidget,
    );
    expect(b.auth.requested, isEmpty);
  });

  testWidgets('send code normalizes the phone and opens OTP', (t) async {
    final b = TestBackend();
    await b.pumpApp(t, signedIn: false);

    await t.enterText(find.byType(TextField), '0712345678');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();

    expect(b.auth.requested, ['+254712345678']);
    expect(find.text('Enter the code'), findsOneWidget);
    expect(find.text('+254 712 345 678'), findsNothing); // inside a rich text
    expect(
      find.textContaining('Resend code in', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('rate limit shows the wait in minutes', (t) async {
    final b = TestBackend();
    b.auth.requestError = otpError('otp_rate_limited', status: 429, retry: 125);
    await b.pumpApp(t, signedIn: false);

    await t.enterText(find.byType(TextField), '0712345678');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();
    expect(
      find.text(
        'Too many code requests. Try again in 3 min.',
        findRichText: true,
      ),
      findsOneWidget,
    );
  });

  testWidgets('wrong code, then success with a name goes to Home', (t) async {
    final b = TestBackend();
    await b.pumpApp(t, signedIn: false);
    await t.enterText(find.byType(TextField), '0712345678');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();

    b.auth.verifyError = otpError('otp_incorrect');
    await t.enterText(find.byType(TextField).last, '111111');
    await t.pumpAndSettle();
    expect(find.text('That code is incorrect. Try again.'), findsOneWidget);
    expect(b.auth.verified, ['111111']);

    b.auth.verifyError = null;
    await t.enterText(find.byType(TextField).last, '123456');
    await t.pumpAndSettle();
    expect(b.auth.verified.last, '123456');
    expect(b.services.session.user?.displayName, 'Achieng Otieno');
    expect(find.text('Home'), findsWidgets);
  });

  testWidgets('expired code disables the boxes until resend', (t) async {
    final b = TestBackend();
    await b.pumpApp(t, signedIn: false);
    await t.enterText(find.byType(TextField), '0712345678');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();

    b.auth.verifyError = otpError('otp_expired');
    await t.enterText(find.byType(TextField).last, '111111');
    await t.pumpAndSettle();
    expect(
      find.text('This code has expired. Request a new code.'),
      findsOneWidget,
    );
    final verify = t.widget<NitumeButton>(
      find.widgetWithText(NitumeButton, 'Verify & continue'),
    );
    expect(verify.onPressed, isNull);

    // Cooldown ends, resend re-enables.
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

  testWidgets('first sign-in without a name asks for it', (t) async {
    final b = TestBackend();
    b.auth.current = user(displayName: null);
    await b.pumpApp(t, signedIn: false);
    await t.enterText(find.byType(TextField), '0712345678');
    await t.tap(find.text('Send code'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).last, '123456');
    await t.pumpAndSettle();

    expect(find.text('What should we call you?'), findsOneWidget);
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    expect(find.text('Enter your name.'), findsOneWidget);

    await t.enterText(find.byType(TextField), 'Achieng Otieno');
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
    expect(b.auth.current.displayName, 'Achieng Otieno');
    expect(find.text('What should we call you?'), findsNothing);
  });

  testWidgets('a stored session restores into the shell', (t) async {
    final b = TestBackend();
    await b.pumpApp(t);
    expect(find.text("Someone there, when you can't be."), findsNothing);
    expect(find.byType(NitumeTabBar), findsOneWidget);
  });
}
