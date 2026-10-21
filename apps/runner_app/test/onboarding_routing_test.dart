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

      // Older API: no `level2Missing`, no ID checks, so the records decide.
      b.account.current = runnerMe(
        verification: const RunnerVerificationSummary(verified: false),
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

    group('RN-L1: level2Missing', () {
      RunnerMe meWith(
        List<Level2Check> missing, {
        VerificationCheckStatus front = VerificationCheckStatus.approved,
        VerificationCheckStatus back = VerificationCheckStatus.approved,
        VerificationCheckStatus selfie = VerificationCheckStatus.approved,
      }) => runnerMe(
        verification: RunnerVerificationSummary(
          verified: false,
          level2Missing: missing,
          checks: [
            check(
              RunnerVerificationType.phone,
              VerificationCheckStatus.approved,
            ),
            check(RunnerVerificationType.governmentId, front, side: _front),
            check(RunnerVerificationType.governmentId, back, side: _back),
            check(RunnerVerificationType.selfie, selfie),
            check(
              RunnerVerificationType.paymentIdentity,
              VerificationCheckStatus.pending,
            ),
          ],
        ),
      );

      test('[] and not verified -> pending, no records call', () async {
        final b = TestBackend();
        b.account.current = meWith(const []);
        b.account.recordsError = StateError('must not be called');
        expect(await onboardingStepFor(b.account), OnboardingStep.pending);
      });

      test('[back, selfie] with back missing -> id', () async {
        final b = TestBackend();
        b.account.current = meWith(
          const [Level2Check.governmentIdBack, Level2Check.selfie],
          back: VerificationCheckStatus.missing,
          selfie: VerificationCheckStatus.missing,
        );
        expect(await onboardingStepFor(b.account), OnboardingStep.id);
      });

      test(
        '[back, selfie] with back pending, selfie missing -> selfie',
        () async {
          final b = TestBackend();
          b.account.current = meWith(
            const [Level2Check.governmentIdBack, Level2Check.selfie],
            back: VerificationCheckStatus.pending,
            selfie: VerificationCheckStatus.missing,
          );
          expect(await onboardingStepFor(b.account), OnboardingStep.selfie);
        },
      );

      test('only pending / rejected entries -> pending', () async {
        final b = TestBackend();
        b.account.current = meWith(
          const [
            Level2Check.governmentIdFront,
            Level2Check.governmentIdBack,
            Level2Check.selfie,
          ],
          front: VerificationCheckStatus.rejected,
          back: VerificationCheckStatus.pending,
          selfie: VerificationCheckStatus.rejected,
        );
        expect(await onboardingStepFor(b.account), OnboardingStep.pending);
      });

      test('an absent check reads as missing', () async {
        final b = TestBackend();
        b.account.current = runnerMe(
          verification: const RunnerVerificationSummary(
            verified: false,
            level2Missing: [Level2Check.governmentIdFront],
          ),
        );
        expect(await onboardingStepFor(b.account), OnboardingStep.id);
      });

      test('null + approved unlabelled record + labelled back pending + selfie '
          '-> pending', () async {
        final b = TestBackend();
        // Older API: no level2Missing and no ID checks in the summary.
        b.account.current = runnerMe(
          verification: const RunnerVerificationSummary(verified: false),
        );
        b.account.records = [
          verification(
            RunnerVerificationType.governmentId,
            VerificationStatus.approved,
            id: 'legacy',
            createdAt: DateTime.utc(2026, 1, 2),
          ),
          _id(VerificationStatus.pending, _back),
          _of(RunnerVerificationType.selfie, VerificationStatus.pending),
        ];
        expect(await onboardingStepFor(b.account), OnboardingStep.pending);
      });

      test('null + summary ID checks win over the records', () async {
        final b = TestBackend();
        b.account.current = runnerMe(
          verification: RunnerVerificationSummary(
            verified: false,
            checks: [
              check(
                RunnerVerificationType.governmentId,
                VerificationCheckStatus.approved,
                side: _front,
              ),
              check(
                RunnerVerificationType.governmentId,
                VerificationCheckStatus.pending,
                side: _back,
              ),
            ],
          ),
        );
        b.account.records = [
          _id(VerificationStatus.pending, _back),
          _of(RunnerVerificationType.selfie, VerificationStatus.pending),
        ];
        expect(await onboardingStepFor(b.account), OnboardingStep.pending);
      });
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
