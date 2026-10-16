import 'package:flutter_test/flutter_test.dart';
import 'package:runner_app/src/app.dart';
import 'package:runner_app/src/screens/auth/phone_screen.dart';
import 'package:runner_app/src/widgets/runner_wordmark.dart';

import 'support/fakes.dart';

void main() {
  testWidgets('a fresh install starts signed out on v-auth-phone', (t) async {
    final b = TestBackend();
    await setUpSurface(t);
    await t.pumpWidget(NitumeRunnerApp(services: b.services));
    await t.pumpAndSettle();
    expect(find.byType(PhoneScreen), findsOneWidget);
    expect(find.byType(RunnerWordmark), findsOneWidget);
  });
}
