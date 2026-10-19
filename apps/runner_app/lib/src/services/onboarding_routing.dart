import 'package:nitume_core/nitume_core.dart';

/// Where a fresh sign-in goes after the name (D-1, `v-auth-otp` routing
/// step 3).
enum OnboardingStep {
  /// Verified, or the check failed: the shell on `v-jobs` (it shows the
  /// verification card when needed).
  shell,

  /// An ID side is missing: `v-onboard-id`.
  id,

  /// Both ID sides are in, the selfie is missing: `v-onboard-selfie`.
  selfie,

  /// Everything is submitted but not all approved: the shell with
  /// `v-onboard-pending` pushed.
  pending,
}

/// Decides the onboarding step from `GET /runners/me` and
/// `GET /runners/me/verifications`. Never throws: any failure gives
/// [OnboardingStep.shell].
Future<OnboardingStep> onboardingStepFor(
  RunnerAccountRepository account,
) async {
  try {
    final me = await account.me();
    if (me.isVerified) return OnboardingStep.shell;
    final docs = RunnerVerificationDocuments.fromRecords(
      await account.verifications(),
    );
    if (docs.idFront == null || docs.idBack == null) return OnboardingStep.id;
    if (docs.selfie == null) return OnboardingStep.selfie;
    return OnboardingStep.pending;
  } on Object {
    return OnboardingStep.shell;
  }
}
