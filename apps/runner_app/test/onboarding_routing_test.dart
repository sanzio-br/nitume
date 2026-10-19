import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/onboarding/onboard_id_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/onboarding_routing.dart';

import 'support/fakes.dart';

const _front = VerificationDocumentSide.front;
const _back = VerificationDocumentSide.back;

RunnerVerification _id(VerificationStatus s, VerificationDocumentSide side) =>
    verification(RunnerVerificationType.governmentId, s, side: side);

RunnerVerification _of(RunnerVerificationType t, VerificationStatus s) =>
    verification(t, s);

void main() {
  group('onboarding routing (D-1)', () {
    test('picks the step from the runner and the records', () async {
      final b = TestBackend();
      expect(await onboardingStepFor(b.account), OnboardingStep.shell);

      b.account.current = runnerMe(
        verification: summary(status: VerificationCheckStatus.missing),
      );
      b.account.records = [];
      expect(await onboardingStepFor(b.account), OnboardingStep.id);

      b.account.records = [
        _id(VerificationStatus.pending, _front),
        _id(VerificationStatus.rejected, _back),
      ];
      expect(await onboardingStepFor(b.account), OnboardingStep.selfie);

      b.account.records = [
        ...b.account.records,
        _of(RunnerVerificationType.selfie, VerificationStatus.pending),
      ];
      expect(await onboardingStepFor(b.account), OnboardingStep.pending);

      b.account.meError = networkError;
      expect(await onboardingStepFor(b.account), OnboardingStep.shell);
    });

    testWidgets('an unverified runner signing in lands on v-onboard-id', (
      t,
    ) async {
      final b = TestBackend();
      b.account.current = runnerMe(
        availability: RunnerAvailability.offline,
        verification: summary(status: VerificationCheckStatus.missing),
      );
      b.account.records = [];
      await b.pumpApp(t, signedIn: false);
      await t.enterText(find.byType(TextField), '0733111222');
      await t.tap(find.text('Send code'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).last, '123456');
      await t.pumpAndSettle();

      expect(find.byType(OnboardIdScreen), findsOneWidget);
      expect(find.byType(RunnerShell, skipOffstage: false), findsOneWidget);
    });

    testWidgets('a restored session goes straight to the shell', (t) async {
      final b = TestBackend();
      b.account.current = runnerMe(
        verification: summary(status: VerificationCheckStatus.missing),
      );
      b.account.records = [];
      await b.pumpApp(t);
      expect(find.byType(RunnerShell), findsOneWidget);
      expect(find.byType(OnboardIdScreen), findsNothing);
    });
  });
}
