import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';
import '../../widgets/privacy_note.dart';
import 'capture_flow.dart';

/// `v-onboard-selfie` copy (`docs/specs/runner/v-onboard-selfie.md`).
abstract final class OnboardSelfieCopy {
  static const title = 'Selfie check';
  static const intro =
      'We use this to confirm you match your ID — this is never shown to '
      'customers.';
  static const dropZone = 'Center your face in the frame';
  static const shutter = 'Take selfie';
  static const hint = 'Face the light, remove sunglasses or a hat.';
  static const retake = 'Retake';
  static const cta = 'Submit for review →';
}

/// `v-onboard-selfie`: the selfie for the manual match with the ID (row
/// 126), step 2 of 2, then `v-onboard-pending`.
///
/// The interim payment-identity record at submit (row 218) is deferred by
/// the orchestrator: `Submit for review →` only moves on.
class OnboardSelfieScreen extends StatefulWidget {
  const OnboardSelfieScreen({super.key});

  @override
  State<OnboardSelfieScreen> createState() => _OnboardSelfieScreenState();
}

class _OnboardSelfieScreenState extends State<OnboardSelfieScreen> {
  CaptureState _state = CaptureState.empty;
  LocalPhoto? _photo;
  PhotoProblem? _problem;
  bool _loading = true;
  bool _capturing = false;

  AppServices get _s => AppScope.read(context);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// A selfie already pending or approved counts as uploaded; a rejected
  /// one must be taken again.
  Future<void> _load() async {
    try {
      final latest = RunnerVerification.latestByType(
        await _s.account.verifications(),
      )[RunnerVerificationType.selfie];
      if (latest != null && latest.status != VerificationStatus.rejected) {
        _state = CaptureState.uploaded;
      }
    } on Object {
      // Start empty; the upload still works.
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _capture() async {
    if (_capturing) return;
    _capturing = true;
    try {
      final LocalPhoto? photo;
      try {
        // TODO(core-ui): front camera only (spec); `CaptureFrom` has no
        // front-camera option yet.
        photo = await capturePhoto(_s, CaptureFrom.camera);
      } on PhotoProblem catch (p) {
        if (!mounted) return;
        setState(() {
          _photo = null;
          _state = CaptureState.empty;
          _problem = p;
        });
        return;
      } on Object {
        if (!mounted) return;
        setState(() => _problem = PhotoProblem.bad);
        return;
      }
      if (photo == null || !mounted) return;
      setState(() {
        _photo = photo;
        _problem = null;
      });
      await _upload();
    } finally {
      _capturing = false;
    }
  }

  Future<void> _upload() async {
    final photo = _photo;
    if (photo == null) return;
    setState(() {
      _state = CaptureState.uploading;
      _problem = null;
    });
    try {
      await _s.account.uploadVerificationDocument(
        RunnerVerificationType.selfie,
        bytes: photo.bytes,
        contentType: photo.contentType,
      );
      if (mounted) setState(() => _state = CaptureState.uploaded);
    } on Object catch (e) {
      if (!mounted) return;
      final f = uploadFailure(e);
      setState(() {
        if (f.problem == PhotoProblem.tooLarge) {
          _photo = null;
          _state = CaptureState.empty;
          _problem = f.problem;
        } else {
          _state = CaptureState.failed;
          _problem = f.problem;
        }
      });
    }
  }

  Widget? _notice() => switch (_problem) {
    PhotoProblem.tooLarge => tooLargeNotice(
      tail: CaptureCopy.tooLargeSelfieTail,
    ),
    PhotoProblem.badType => const NitumeNotice(message: CaptureCopy.badType),
    PhotoProblem.bad => const NitumeNotice(message: CaptureCopy.badPhoto),
    null => null,
  };

  Widget _captureArea() {
    if (_state == CaptureState.empty) {
      return CaptureDropZone(
        key: const ValueKey('selfie-drop-zone'),
        caption: OnboardSelfieCopy.dropZone,
        icon: Icons.portrait_outlined,
        height: 260,
        semanticLabel: OnboardSelfieCopy.shutter,
        onPick: _capture,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Square photo; the failed-state chip goes under it.
        SizedBox(
          width: 240,
          child: CaptureThumbnail(
            key: const ValueKey('selfie-tile'),
            state: _state,
            image: _photo?.image,
            emptyIcon: Icons.portrait_outlined,
            semanticLabel: 'Selfie',
            onRetry: _state == CaptureState.failed ? _upload : null,
          ),
        ),
        const SizedBox(height: 10),
        NitumeButton.outline(
          label: OnboardSelfieCopy.retake,
          size: NitumeButtonSize.small,
          onPressed: _state == CaptureState.uploading ? null : _capture,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final notice = _notice();
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: const NitumePushedHeader(
        title: OnboardSelfieCopy.title,
        step: 2,
        totalSteps: 2,
      ),
      body: _loading
          ? const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: SkeletonCard(height: 260),
            )
          : ListView(
              padding: const EdgeInsets.only(bottom: 16),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                  child: Text(
                    OnboardSelfieCopy.intro,
                    style: NitumeTextStyles.muted.copyWith(fontSize: 13),
                  ),
                ),
                if (notice != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: notice,
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: _captureArea(),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
                  child: Text(
                    OnboardSelfieCopy.hint,
                    style: NitumeTextStyles.mutedSmall,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: PrivacyNote(),
                ),
              ],
            ),
      bottomNavigationBar: FixedCta(
        child: NitumeButton.primary(
          label: OnboardSelfieCopy.cta,
          expand: true,
          onPressed: _state == CaptureState.uploaded
              ? () => Nav.replaceOnboardingWithPending(context)
              : null,
        ),
      ),
    );
  }
}
