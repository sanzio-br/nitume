import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../services/app_services.dart';
import '../services/shell_controller.dart';

/// Route names. Screens are registered in `routes.dart`.
abstract final class Routes {
  static const otp = '/auth/otp';
  static const onboardId = '/onboarding/id';
  static const onboardSelfie = '/onboarding/selfie';
  static const onboardPending = '/onboarding/pending';
  static const locationDisclosure = '/location-disclosure';
  static const jobDetail = '/jobs/detail';
}

/// `v-auth-otp` arguments.
class OtpArgs {
  const OtpArgs({required this.phone, this.cooldown});

  /// Normalized `+2547XXXXXXXX`.
  final String phone;

  /// Remaining resend cooldown, when the phone screen hit one.
  final Duration? cooldown;
}

/// `v-onboard-id` arguments.
class OnboardIdArgs {
  const OnboardIdArgs({this.firstRun = false, this.side});

  /// Opened by the sign-in routing (D-1): back asks `Leave verification?`.
  final bool firstRun;

  /// Side to select first (`Upload again` on a rejected side, row 209).
  final VerificationDocumentSide? side;
}

/// `v-job-detail` arguments: the offer as listed on `v-jobs` (shown at once,
/// then refreshed).
class JobDetailArgs {
  const JobDetailArgs({required this.errandId, this.offer});

  final String errandId;
  final RunnerJobView? offer;
}

/// How `v-job-detail` ended, for `v-jobs`.
enum JobDetailOutcome {
  /// Declined: remove the card (no snackbar).
  declined,

  /// The offer is gone (expired, withdrawn, refused): remove the card and
  /// show `That offer is no longer available.`
  unavailable,
}

/// Typed navigation for runner screens (`_shared.md` §1).
abstract final class Nav {
  /// Routes are built as `MaterialPageRoute<dynamic>`, so the result is
  /// read as `Object?` and cast.
  static Future<T?> _push<T>(
    BuildContext context,
    String name, [
    Object? a,
  ]) async {
    final result = await Navigator.of(context)
        .pushNamed<Object?>(name, arguments: a);
    return result is T ? result : null;
  }

  /// Pops every pushed screen back to the shell (or the signed-out root).
  static void popToRoot(BuildContext context) =>
      Navigator.of(context).popUntil((r) => r.isFirst);

  /// Back to the shell on [tab] (`Back to app`, `Back to jobs`, accept).
  static void toShellTab(BuildContext context, RunnerTab tab) {
    AppScope.read(context).shell.select(tab);
    popToRoot(context);
  }

  static Future<void> toOtp(
    BuildContext context, {
    required String phone,
    Duration? cooldown,
  }) => _push(context, Routes.otp, OtpArgs(phone: phone, cooldown: cooldown));

  static Future<void> toOnboardId(
    BuildContext context, {
    VerificationDocumentSide? side,
  }) => _push(context, Routes.onboardId, OnboardIdArgs(side: side));

  static Future<void> toOnboardSelfie(BuildContext context) =>
      _push(context, Routes.onboardSelfie);

  static Future<void> toOnboardPending(BuildContext context) =>
      _push(context, Routes.onboardPending);

  /// `Submit for review →`: replaces the onboarding stack so back does not
  /// return to capture.
  static Future<void> replaceOnboardingWithPending(BuildContext context) =>
      Navigator.of(context)
          .pushNamedAndRemoveUntil(Routes.onboardPending, (r) => r.isFirst);

  /// `x-location-disclosure`; resolves with the permission after
  /// `Continue`, or `null` after `Not now` / back.
  static Future<LocationAccess?> toLocationDisclosure(BuildContext context) =>
      _push<LocationAccess>(context, Routes.locationDisclosure);

  static Future<JobDetailOutcome?> toJobDetail(
    BuildContext context,
    RunnerJobView offer,
  ) => _push<JobDetailOutcome>(
    context,
    Routes.jobDetail,
    JobDetailArgs(errandId: offer.id, offer: offer),
  );
}
