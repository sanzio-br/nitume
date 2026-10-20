import 'package:flutter/material.dart';

import 'nitume_button.dart';
import 'nitume_dialog.dart';

/// Runner location-sharing copy approved by the owner (BOARD row 246,
/// 2026-10-20). Use these constants verbatim; never re-type the text.
abstract final class RunnerLocationCopy {
  /// `x-location-disclosure` Body 2 (replaces "even when the app is
  /// closed").
  static const disclosureBody2 =
      'During a job we keep sharing it when you switch apps or lock your '
      'phone, until you finish the task or go offline. If you close the app '
      'completely, or your phone stops it to save battery, sharing stops '
      'until you open the app again.';

  /// One-time job-start notice title (`v-active`, "Location during a job").
  static const jobStartNoticeTitle = 'Sharing your location during jobs';

  /// One-time job-start notice body.
  static const jobStartNoticeBody =
      "While you're on a job, Nitume Runner shares your location with the "
      'customer, also when you switch apps or lock your phone. It stops when '
      'you finish the task or go offline. If you close the app completely, '
      'or your phone stops it to save battery, sharing stops until you open '
      'the app again.';

  /// The notice's only button.
  static const jobStartNoticeOk = 'OK';
}

/// A flag that, once set, stays set for the install (not cleared at log
/// out). The runner app uses `SharedPreferencesOneTimeFlag` from
/// `package:nitume_runner_device`; tests use [MemoryOneTimeFlag].
abstract interface class OneTimeFlag {
  Future<bool> isSet();
  Future<void> set();
}

/// In-memory [OneTimeFlag] (tests, previews).
class MemoryOneTimeFlag implements OneTimeFlag {
  MemoryOneTimeFlag([this._set = false]);

  bool _set;

  @override
  Future<bool> isSet() async => _set;

  @override
  Future<void> set() async => _set = true;
}

/// C-35 one-time job-start location notice (`v-active`, owner rows 245 and
/// 246): [RunnerLocationCopy.jobStartNoticeTitle], the body and one primary
/// `OK` button. Informational only: no OS prompt, no permission step. The
/// title takes focus when it opens (`v-active` accessibility).
///
/// Open it with [JobStartLocationNotice.showOnce] after the first
/// successful accept; the job is already RUNNER_EN_ROUTE, so the notice
/// never blocks or delays it.
class JobStartLocationNotice extends StatelessWidget {
  const JobStartLocationNotice({super.key, this.onOk});

  /// Called by `OK`; defaults to closing the dialog.
  final VoidCallback? onOk;

  @override
  Widget build(BuildContext context) => NitumeDialog(
    title: RunnerLocationCopy.jobStartNoticeTitle,
    body: RunnerLocationCopy.jobStartNoticeBody,
    autofocusTitle: true,
    actions: [
      NitumeButton.primary(
        label: RunnerLocationCopy.jobStartNoticeOk,
        onPressed: onOk ?? () => Navigator.of(context).pop(),
      ),
    ],
  );

  /// Shows the notice unless [shown] is already set, and sets it, so it
  /// appears once per install. Returns whether it was shown.
  ///
  /// The flag is set when the notice opens, so a kill while it is on screen
  /// does not bring it back. A flag that cannot be read shows the notice
  /// (it is the safer side of a disclosure); errors never escape.
  static Future<bool> showOnce(
    BuildContext context, {
    required OneTimeFlag shown,
  }) async {
    var seen = false;
    try {
      seen = await shown.isSet();
    } on Object {
      seen = false;
    }
    if (seen || !context.mounted) return false;
    try {
      await shown.set();
    } on Object {
      // Shown again next time; never block the job.
    }
    if (!context.mounted) return false;
    await NitumeDialog.show<void>(
      context,
      builder: (_) => const JobStartLocationNotice(),
    );
    return true;
  }
}
