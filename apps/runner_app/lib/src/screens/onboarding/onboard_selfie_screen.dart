import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
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

  /// The interim payment-identity record failed (S-1; proposed copy).
  static const submitError =
      "Couldn't submit. Check your connection and try again.";
}

/// `v-onboard-selfie`: the selfie for the manual match with the ID (row
/// 126), step 2 of 2, then `v-onboard-pending`.
///
/// `Submit for review →` first makes sure the interim payment-identity
/// record exists (rows 218, 222; S-1) for the ops M-Pesa name match, then
/// replaces the onboarding stack with `v-onboard-pending`.
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
  bool _submitting = false;
  bool _submitFailed = false;

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
        // Front camera only, no gallery (spec).
        photo = await capturePhoto(_s, CaptureFrom.frontCamera);
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

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _submitFailed = false;
    });
    try {
      await _s.account.ensurePaymentIdentityVerification();
      if (!mounted) return;
      await Nav.replaceOnboardingWithPending(context);
    } on Object {
      // The selfie stays uploaded; only the submit is retried.
      if (mounted) setState(() => _submitFailed = true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget? _notice() => _submitFailed
      ? const NitumeNotice(message: OnboardSelfieCopy.submitError)
      : _photoNotice();

  Widget? _photoNotice() => switch (_problem) {
    PhotoProblem.tooLarge => tooLargeNotice(
      tail: CaptureCopy.tooLargeSelfieTail,
    ),
    PhotoProblem.badType => const NitumeNotice(message: CaptureCopy.badType),
    PhotoProblem.bad => const NitumeNotice(message: CaptureCopy.badPhoto),
    null => null,
  };

  Widget _captureArea() {
    final photo = _photo;
    final busy = _state == CaptureState.uploading;
    if (photo == null && _state == CaptureState.uploaded) {
      // A selfie already on file (pending or approved): no local photo to
      // show, only its state and a way to take it again.
      return Center(
        child: SizedBox(
          width: 240,
          child: CaptureThumbnail(
            key: const ValueKey('selfie-tile'),
            state: _state,
            emptyIcon: Icons.portrait_outlined,
            semanticLabel: 'Selfie',
            onRemove: _capture,
            removeLabel: OnboardSelfieCopy.retake,
          ),
        ),
      );
    }
    return CaptureDropZone(
      key: const ValueKey('selfie-drop-zone'),
      caption: OnboardSelfieCopy.dropZone,
      icon: Icons.portrait_outlined,
      height: 260,
      semanticLabel: OnboardSelfieCopy.shutter,
      onPick: busy ? null : _capture,
      image: photo?.image,
      captureState: _state == CaptureState.empty
          ? CaptureState.uploaded
          : _state,
      onRetake: photo == null ? null : _capture,
      retakeLabel: OnboardSelfieCopy.retake,
      onRetry: _state == CaptureState.failed ? _upload : null,
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
      bottomNavigationBar: NitumeFixedCta(
        child: NitumeButton.primary(
          label: OnboardSelfieCopy.cta,
          expand: true,
          loading: _submitting,
          onPressed: _state == CaptureState.uploaded ? _submit : null,
        ),
      ),
    );
  }
}
