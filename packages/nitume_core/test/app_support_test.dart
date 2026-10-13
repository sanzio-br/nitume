import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/app_support.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

AppUser _user(UserRole role, {String? name = 'Brian Kamau'}) => AppUser(
  id: 'u1',
  phone: '+254712345678',
  role: role,
  status: UserStatus.active,
  displayName: name,
);

const _tokens = AuthTokens(accessToken: 'a', refreshToken: 'r');

class _FakeAuth implements AuthRepository {
  _FakeAuth(this.me);

  AppUser me;
  bool restored = true;
  int logouts = 0;

  @override
  Future<AuthTokens?> restoreSession() async => restored ? _tokens : null;

  @override
  Future<AppUser> currentUser() async => me;

  @override
  Future<void> logout() async => logouts++;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Push implements PushTokenRegistrar {
  int registers = 0, unregisters = 0;

  @override
  Future<void> registerAfterSignIn() async => registers++;

  @override
  Future<void> unregisterBeforeSignOut() async => unregisters++;
}

void main() {
  test('ApiErrorCodes.roleMismatch', () {
    expect(ApiErrorCodes.roleMismatch, 'role_mismatch');
  });

  test('minutesFrom and formatPhoneIntl', () {
    expect(minutesFrom(const Duration(seconds: 61)), '2');
    expect(minutesFrom(Duration.zero), '1');
    expect(formatPhoneIntl('0712345678'), '+254 712 345 678');
    expect(formatPhoneIntl('abc'), 'abc');
  });

  test('friendlyError', () {
    expect(
      friendlyError(
        const NitumeApiException(message: 'x', isNetworkError: true),
      ),
      'Check your connection and try again.',
    );
    expect(
      friendlyError(Exception()),
      'Something went wrong. Please try again.',
    );
  });

  testWidgets('rateLimitError puts the minutes in Fira Code', (tester) async {
    await pumpThemed(tester, rateLimitError(const Duration(minutes: 3)));
    final rich = tester.widget<RichText>(find.byType(RichText).last);
    TextSpan? number;
    rich.text.visitChildren((s) {
      if (s is TextSpan && s.text == '3') number = s;
      return true;
    });
    expect(number!.style!.fontFamily, NitumeTypography.numericFamily);
    expect(
      rich.text.toPlainText(),
      'Too many code requests. Try again in 3 min.',
    );
  });

  testWidgets('AuthFrame and AuthHeading', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: NitumeTheme.light(),
        home: const AuthFrame(
          children: [
            AuthHeading(title: 'Welcome', sub: Text('Enter your phone')),
          ],
        ),
      ),
    );
    expect(
      tester.widget<Text>(find.text('Welcome')).style,
      NitumeTextStyles.authHeading,
    );
    expect(find.text('Enter your phone'), findsOneWidget);
  });

  group('SessionController', () {
    test('no required role: any role signs in (customer behaviour)', () async {
      final push = _Push();
      final s = SessionController(
        auth: _FakeAuth(_user(UserRole.customer)),
        push: push,
      );
      await s.restore();
      expect(s.status, SessionStatus.signedIn);
      expect(push.registers, 1);
    });

    test('runner app refuses a restored customer session', () async {
      final auth = _FakeAuth(_user(UserRole.customer));
      final s = SessionController(auth: auth, requiredRole: UserRole.runner);
      await s.restore();
      expect(s.status, SessionStatus.signedOut);
      expect(auth.logouts, 1);
      expect(s.takeWrongAccountFlag(), isTrue);
      expect(s.takeWrongAccountFlag(), isFalse);
    });

    test('completeSignIn throws for another role and drops tokens', () async {
      final auth = _FakeAuth(_user(UserRole.customer));
      final s = SessionController(auth: auth, requiredRole: UserRole.runner);
      await expectLater(
        s.completeSignIn(
          AuthResult(user: _user(UserRole.customer), tokens: _tokens),
        ),
        throwsA(isA<WrongAccountTypeException>()),
      );
      expect(auth.logouts, 1);
      expect(s.user, isNull);
    });

    test('runner without a name goes to name capture', () async {
      final s = SessionController(
        auth: _FakeAuth(_user(UserRole.runner, name: null)),
        requiredRole: UserRole.runner,
      );
      await s.completeSignIn(
        AuthResult(user: _user(UserRole.runner, name: null), tokens: _tokens),
      );
      expect(s.status, SessionStatus.needsName);
    });

    test('logout unregisters push and expire sets the flag', () async {
      final push = _Push();
      final auth = _FakeAuth(_user(UserRole.runner));
      final s = SessionController(auth: auth, push: push);
      await s.restore();
      s.expire();
      expect(s.takeExpiredFlag(), isTrue);
      await s.restore();
      await s.logout();
      expect(push.unregisters, 1);
      expect(s.status, SessionStatus.signedOut);
    });
  });
}
