import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/services/session.dart';

import 'support/fakes.dart';

const _tokens = AuthTokens(accessToken: 'a', refreshToken: 'r');

void main() {
  test('a runner with a name signs in and registers push', () async {
    final auth = FakeAuth();
    final push = FakePushRegistrar();
    final s = SessionController(auth: auth, push: push);
    await s.completeSignIn(AuthResult(user: user(), tokens: _tokens));
    expect(s.status, SessionStatus.signedIn);
    expect(push.registered, 1);
  });

  test('a runner without a name goes to name capture', () async {
    final auth = FakeAuth()..current = user(displayName: null);
    final s = SessionController(auth: auth);
    await s.completeSignIn(
      AuthResult(user: user(displayName: null), tokens: _tokens),
    );
    expect(s.status, SessionStatus.needsName);
    await s.saveDisplayName('Brian Kamau');
    expect(s.status, SessionStatus.signedIn);
  });

  test('a customer account is refused and its session dropped', () async {
    final auth = FakeAuth()..stored = _tokens;
    final push = FakePushRegistrar();
    final s = SessionController(auth: auth, push: push);
    await expectLater(
      s.completeSignIn(
        AuthResult(
          user: user(role: UserRole.customer),
          tokens: _tokens,
        ),
      ),
      throwsA(isA<WrongAccountTypeException>()),
    );
    expect(auth.logouts, 1);
    expect(auth.stored, isNull);
    expect(s.user, isNull);
    expect(s.status, isNot(SessionStatus.signedIn));
    expect(push.registered, 0);
  });

  test('a restored non-runner session is signed out once', () async {
    final auth = FakeAuth()
      ..stored = _tokens
      ..current = user(role: UserRole.customer);
    final s = SessionController(auth: auth);
    await s.restore();
    expect(s.status, SessionStatus.signedOut);
    expect(auth.stored, isNull);
    expect(s.takeWrongAccountFlag(), isTrue);
    expect(s.takeWrongAccountFlag(), isFalse);
  });

  test('restore offline fails softly, 401 signs out', () async {
    final auth = FakeAuth()
      ..stored = _tokens
      ..currentError = const NitumeApiException(
        message: 'offline',
        isNetworkError: true,
      );
    final s = SessionController(auth: auth);
    await s.restore();
    expect(s.status, SessionStatus.restoreFailed);

    auth.currentError = const NitumeApiException(
      message: 'no',
      statusCode: 401,
    );
    await s.restore();
    expect(s.status, SessionStatus.signedOut);
  });

  test('log out unregisters push and clears tokens', () async {
    final auth = FakeAuth()..stored = _tokens;
    final push = FakePushRegistrar();
    final s = SessionController(auth: auth, push: push);
    await s.restore();
    expect(s.status, SessionStatus.signedIn);
    await s.logout();
    expect(push.unregistered, 1);
    expect(auth.stored, isNull);
    expect(s.status, SessionStatus.signedOut);
  });
}
