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

/// Decides the onboarding step from `GET /runners/me` (and, with an older
/// API, `GET /runners/me/verifications`), `v-auth-otp.md` RN-L1. A side
/// approved through an unlabelled ID photo counts as done (row 268). Never
/// throws: any failure gives [OnboardingStep.shell].
Future<OnboardingStep> onboardingStepFor(
  RunnerAccountRepository account,
) async {
  try {
    final me = await account.me();
    if (me.isVerified) return OnboardingStep.shell;
    final v = me.verification;
    final missing = v.level2Missing;
    if (missing != null) return _fromLevel2Missing(v, missing);
    // Older API without `level2Missing`: the records, with the ID side
    // statuses from the summary when it has them (core row-268 fallback
    // otherwise).
    final docs = RunnerVerificationDocuments.fromRecords(
      await account.verifications(),
      summary: v,
    );
    if (VerificationDocumentSide.values.any(
      (side) => docs.idStatusFor(side) == VerificationCheckStatus.missing,
    )) {
      return OnboardingStep.id;
    }
    if (docs.selfie == null) return OnboardingStep.selfie;
    return OnboardingStep.pending;
  } on Object {
    return OnboardingStep.shell;
  }
}

/// `level2Missing` names the Level 2 checks whose newest record is not
/// approved (missing, pending or rejected): only a `missing` one needs a
/// capture; pending and rejected ones are handled from `v-onboard-pending`.
OnboardingStep _fromLevel2Missing(
  RunnerVerificationSummary v,
  List<Level2Check> missing,
) {
  bool needsCapture(Level2Check c) {
    final check = switch (c) {
      Level2Check.governmentIdFront => v.checkFor(
        RunnerVerificationType.governmentId,
        side: VerificationDocumentSide.front,
      ),
      Level2Check.governmentIdBack => v.checkFor(
        RunnerVerificationType.governmentId,
        side: VerificationDocumentSide.back,
      ),
      Level2Check.selfie => v.checkFor(RunnerVerificationType.selfie),
    };
    // An absent check reads as missing.
    return (check?.status ?? VerificationCheckStatus.missing) ==
        VerificationCheckStatus.missing;
  }

  final ids = missing.where((c) => c != Level2Check.selfie);
  if (ids.any(needsCapture)) return OnboardingStep.id;
  if (missing.contains(Level2Check.selfie) &&
      needsCapture(Level2Check.selfie)) {
    return OnboardingStep.selfie;
  }
  return OnboardingStep.pending;
}
