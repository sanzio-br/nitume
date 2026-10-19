import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/privacy_note.dart';

/// `v-onboard-pending` copy (`docs/specs/runner/v-onboard-pending.md`).
abstract final class OnboardPendingCopy {
  static const title = 'Verification status';
  static const phone = 'Phone number';
  static const nationalId = 'National ID';
  static const selfie = 'Selfie / liveness check';
  static const payment = 'M-Pesa identity match';
  static const uploadAgain = 'Upload again';
  static const retakeSelfie = 'Retake selfie';
  static const frontRejected = 'Front photo not approved';
  static const backRejected = 'Back photo not approved';
  static const bothRejected = 'Both photos not approved';
  static const bodyPendingLead = 'Verification usually takes under ';
  static const bodyPendingHours = '24';
  static const bodyPendingTail =
      " hours. We'll notify you the moment you're approved to start "
      'accepting jobs.';
  static const bodyRejected =
      "Some checks weren't approved. Fix them below and we'll review again.";

  /// m-5: the ID or selfie not started and nothing rejected.
  static const bodyNotStarted =
      'Upload your ID and a selfie to start accepting jobs.';
  static const bodyVerified =
      "You're verified. You can go online and accept jobs.";
  static const backToApp = 'Back to app';
  static const startJobs = 'Start accepting jobs';
}

/// Chip label and tone for one check (spec "Status chips").
({String label, StatusTone tone}) verificationChip(
  VerificationCheckStatus status,
) => switch (status) {
  VerificationCheckStatus.approved => (
    label: 'Verified',
    tone: StatusTone.success,
  ),
  VerificationCheckStatus.pending => (
    label: 'In review',
    tone: StatusTone.pending,
  ),
  VerificationCheckStatus.rejected => (
    label: 'Not approved',
    tone: StatusTone.danger,
  ),
  VerificationCheckStatus.missing => (
    label: 'Not started',
    tone: StatusTone.info,
  ),
};

VerificationCheckStatus _statusOf(RunnerVerification? r) => switch (r?.status) {
  VerificationStatus.approved => VerificationCheckStatus.approved,
  VerificationStatus.pending => VerificationCheckStatus.pending,
  VerificationStatus.rejected => VerificationCheckStatus.rejected,
  null => VerificationCheckStatus.missing,
};

/// The four rows as shown, from `GET /runners/me/verifications`: the
/// newest record for phone, selfie and payment identity; the National ID
/// combined from its two sides (row 209).
class VerificationRows {
  VerificationRows(List<RunnerVerification> records)
    : _latest = RunnerVerification.latestByType(records),
      docs = RunnerVerificationDocuments.fromRecords(records);

  final Map<RunnerVerificationType, RunnerVerification> _latest;
  final RunnerVerificationDocuments docs;

  VerificationCheckStatus get phone =>
      _statusOf(_latest[RunnerVerificationType.phone]);
  VerificationCheckStatus get nationalId => docs.nationalIdStatus;
  VerificationCheckStatus get selfie =>
      _statusOf(_latest[RunnerVerificationType.selfie]);
  VerificationCheckStatus get payment =>
      _statusOf(_latest[RunnerVerificationType.paymentIdentity]);

  List<VerificationCheckStatus> get all => [phone, nationalId, selfie, payment];

  bool get anyRejected => all.contains(VerificationCheckStatus.rejected);

  /// The ID or the selfie has not been submitted.
  bool get captureNotStarted =>
      nationalId == VerificationCheckStatus.missing ||
      selfie == VerificationCheckStatus.missing;
  bool get allApproved =>
      all.every((s) => s == VerificationCheckStatus.approved);
}

/// `v-onboard-pending`: the state of each verification check, what happens
/// next, and the way back to a rejected capture. Also Profile →
/// `Verification documents`.
class OnboardPendingScreen extends StatefulWidget {
  const OnboardPendingScreen({super.key});

  @override
  State<OnboardPendingScreen> createState() => _OnboardPendingScreenState();
}

class _OnboardPendingScreenState extends State<OnboardPendingScreen>
    with WidgetsBindingObserver {
  VerificationRows? _rows;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Re-fetch on resume (a `verification decided` push may have arrived).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final records = await AppScope.read(context).account.verifications();
      if (!mounted) return;
      setState(() {
        _rows = VerificationRows(records);
        _error = null;
        _loading = false;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _open(Future<void> Function() go) async {
    await go();
    if (mounted) _load();
  }

  Widget _chip(VerificationCheckStatus s) {
    final c = verificationChip(s);
    return StatusChip(
      label: c.label,
      tone: c.tone,
      size: StatusChipSize.compact,
    );
  }

  Widget _card(VerificationRows rows) {
    final rejectedSides = rows.docs.idRejectedSides;
    final idCaption = switch (rejectedSides.length) {
      2 => OnboardPendingCopy.bothRejected,
      1 =>
        rejectedSides.first == VerificationDocumentSide.front
            ? OnboardPendingCopy.frontRejected
            : OnboardPendingCopy.backRejected,
      _ => null,
    };
    final idRejected = rows.nationalId == VerificationCheckStatus.rejected;
    final selfieRejected = rows.selfie == VerificationCheckStatus.rejected;
    return NitumeCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InfoRowList(
        rows: [
          InfoRow.trailing(
            label: OnboardPendingCopy.phone,
            trailing: _chip(rows.phone),
          ),
          InfoRow.trailing(
            label: OnboardPendingCopy.nationalId,
            trailing: _chip(rows.nationalId),
            below: idRejected
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (idCaption != null)
                        Text(idCaption, style: NitumeTextStyles.mutedSmall),
                      NitumeButton.link(
                        label: OnboardPendingCopy.uploadAgain,
                        onPressed: () => _open(
                          () => Nav.toOnboardId(
                            context,
                            side: rejectedSides.isEmpty
                                ? null
                                : rejectedSides.first,
                          ),
                        ),
                      ),
                    ],
                  )
                : null,
          ),
          InfoRow.trailing(
            label: OnboardPendingCopy.selfie,
            trailing: _chip(rows.selfie),
            below: selfieRejected
                ? NitumeButton.link(
                    label: OnboardPendingCopy.retakeSelfie,
                    onPressed: () => _open(() => Nav.toOnboardSelfie(context)),
                  )
                : null,
          ),
          InfoRow.trailing(
            label: OnboardPendingCopy.payment,
            trailing: _chip(rows.payment),
          ),
        ],
      ),
    );
  }

  Widget _body(VerificationRows rows) {
    final style = NitumeTextStyles.muted.copyWith(fontSize: 12.5);
    if (rows.anyRejected) {
      return Text(OnboardPendingCopy.bodyRejected, style: style);
    }
    if (rows.allApproved) {
      return Text(OnboardPendingCopy.bodyVerified, style: style);
    }
    if (rows.captureNotStarted) {
      return Text(OnboardPendingCopy.bodyNotStarted, style: style);
    }
    return Text.rich(
      const TextSpan(
        children: [
          TextSpan(text: OnboardPendingCopy.bodyPendingLead),
          NumSpan(OnboardPendingCopy.bodyPendingHours),
          TextSpan(text: OnboardPendingCopy.bodyPendingTail),
        ],
      ),
      style: style,
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    final Widget content;
    if (_loading) {
      content = const Padding(
        padding: EdgeInsets.symmetric(horizontal: 20),
        child: SkeletonCard(height: 200),
      );
    } else if (rows == null) {
      content = NitumeErrorState(
        message: friendlyError(_error ?? StateError('no data')),
        onRetry: () {
          setState(() => _loading = true);
          _load();
        },
      );
    } else {
      content = RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: _card(rows),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: _body(rows),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: PrivacyNote(full: true),
            ),
          ],
        ),
      );
    }
    final verified = rows?.allApproved ?? false;
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: const NitumePushedHeader(title: OnboardPendingCopy.title),
      body: content,
      bottomNavigationBar: FixedCta(
        child: verified
            ? NitumeButton.primary(
                label: OnboardPendingCopy.startJobs,
                expand: true,
                onPressed: () => Nav.toShellTab(context, RunnerTab.jobs),
              )
            : NitumeButton.outline(
                label: OnboardPendingCopy.backToApp,
                expand: true,
                onPressed: () => Nav.toShellTab(context, RunnerTab.jobs),
              ),
      ),
    );
  }
}
