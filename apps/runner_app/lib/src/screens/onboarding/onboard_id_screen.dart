import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/privacy_note.dart';
import 'capture_flow.dart';

/// `v-onboard-id` copy (`docs/specs/runner/v-onboard-id.md`).
abstract final class OnboardIdCopy {
  static const title = 'ID verification';
  static const intro =
      'Upload clear photos of the front and back of your National ID.';
  static const dropZone = 'Tap to take a photo or upload';
  static const hint =
      'Make sure all four corners are visible and the text is sharp.';
  static const cta = 'Continue →';
  static const takePhoto = 'Take photo';
  static const fromGallery = 'Choose from gallery';
  static const retake = 'Retake';

  /// Caption under a side the reviewer approved (RN-L1, proposed).
  static const verified = 'Verified';
  static const rejectedBoth =
      "Your ID photos couldn't be verified. Upload clear photos of both sides.";
  static String rejectedSide(VerificationDocumentSide side) =>
      "Your ${side.wire} photo couldn't be verified. Upload a clearer photo "
      'of that side.';
  static String sideLine(VerificationDocumentSide side) =>
      '${side.label} of your ID';
  static const leaveTitle = 'Leave verification?';
  static const leaveBody = 'You can finish it later from your profile.';
  static const leave = 'Leave';
  static const stay = 'Stay';
}

class _SideState {
  CaptureState state = CaptureState.empty;
  LocalPhoto? photo;

  /// The newest record for this side was rejected and no new photo is in.
  bool rejected = false;

  /// The server says this side is approved (labelled, or filled by an
  /// approved unlabelled photo, row 268): done, never re-captured.
  bool approved = false;
  bool tooLarge = false;

  bool get uploaded => state == CaptureState.uploaded;
}

/// `v-onboard-id`: front and back of the National ID (rows 195, 200, 209),
/// step 1 of 2. Each side is uploaded on its own with `side` sent
/// explicitly; the tiles are rebuilt from `GET /runners/me/verifications`.
class OnboardIdScreen extends StatefulWidget {
  const OnboardIdScreen({super.key, this.firstRun = false, this.initialSide});

  /// Opened by the sign-in routing: back asks `Leave verification?`.
  final bool firstRun;

  /// Side to select first (`Upload again` from `v-onboard-pending`).
  final VerificationDocumentSide? initialSide;

  @override
  State<OnboardIdScreen> createState() => _OnboardIdScreenState();
}

class _OnboardIdScreenState extends State<OnboardIdScreen> {
  final _sides = {
    for (final s in VerificationDocumentSide.values) s: _SideState(),
  };
  VerificationDocumentSide? _selected;
  bool _loading = true;
  bool _capturing = false;

  /// Screen notice for the last failure (`null` when none).
  PhotoProblem? _problem;
  String? _message;

  AppServices get _s => AppScope.read(context);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// Tiles from the status of each side (`docs.idStatusFor`, RN-L1): the
  /// API summary when `GET /runners/me` answers, else the records alone
  /// (core applies the same row-268 rule). No stored image is ever shown.
  Future<void> _load() async {
    final account = _s.account;
    final me = account.me().then<RunnerMe?>((m) => m, onError: (_) => null);
    try {
      final records = await account.verifications();
      final docs = RunnerVerificationDocuments.fromRecords(
        records,
        summary: (await me)?.verification,
      );
      for (final side in VerificationDocumentSide.values) {
        final st = _sides[side]!;
        switch (docs.idStatusFor(side)) {
          case VerificationCheckStatus.approved:
            st.state = CaptureState.uploaded;
            st.approved = true;
          case VerificationCheckStatus.pending:
            st.state = CaptureState.uploaded;
          case VerificationCheckStatus.rejected:
            st.rejected = true;
          case VerificationCheckStatus.missing:
            break;
        }
      }
    } on Object {
      // Start with empty tiles; uploads still work.
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _selected = _firstToCapture(preferred: widget.initialSide);
    });
  }

  /// A rejected side first, then [preferred], then the first side not
  /// uploaded (front, then back).
  VerificationDocumentSide? _firstToCapture({
    VerificationDocumentSide? preferred,
  }) {
    for (final side in VerificationDocumentSide.values) {
      if (_sides[side]!.rejected) return side;
    }
    if (preferred != null && !_sides[preferred]!.uploaded) return preferred;
    for (final side in VerificationDocumentSide.values) {
      if (!_sides[side]!.uploaded) return side;
    }
    return null;
  }

  bool get _bothUploaded => _sides.values.every((s) => s.uploaded);

  Future<CaptureFrom?> _pickSource() => showModalBottomSheet<CaptureFrom>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MenuRow(
              label: OnboardIdCopy.takePhoto,
              leadingIcon: Icons.photo_camera_outlined,
              onTap: () => Navigator.of(sheet).pop(CaptureFrom.camera),
            ),
            const SizedBox(height: 8),
            MenuRow(
              label: OnboardIdCopy.fromGallery,
              leadingIcon: Icons.photo_library_outlined,
              onTap: () => Navigator.of(sheet).pop(CaptureFrom.gallery),
            ),
          ],
        ),
      ),
    ),
  );

  Future<void> _capture(VerificationDocumentSide side) async {
    if (_capturing || _sides[side]!.approved) return;
    setState(() => _selected = side);
    final from = await _pickSource();
    if (from == null || !mounted) return;
    _capturing = true;
    try {
      final LocalPhoto? photo;
      try {
        photo = await capturePhoto(_s, from);
      } on PhotoProblem catch (p) {
        if (!mounted) return;
        setState(() {
          final st = _sides[side]!;
          st.photo = null;
          st.tooLarge = p == PhotoProblem.tooLarge;
          // Too large: nothing captured, the tile shows `Too large`.
          st.state = st.tooLarge ? CaptureState.empty : CaptureState.failed;
          _problem = p;
          _message = null;
        });
        return;
      } on Object catch (e) {
        if (mounted) setState(() => _message = friendlyError(e));
        return;
      }
      if (photo == null || !mounted) return;
      setState(() {
        final st = _sides[side]!;
        st.photo = photo;
        st.tooLarge = false;
        _problem = null;
        _message = null;
      });
      await _upload(side);
    } finally {
      _capturing = false;
    }
  }

  Future<void> _upload(VerificationDocumentSide side) async {
    final st = _sides[side]!;
    final photo = st.photo;
    if (photo == null) return;
    setState(() {
      st.state = CaptureState.uploading;
      _problem = null;
      _message = null;
    });
    try {
      await _s.account.uploadVerificationDocument(
        RunnerVerificationType.governmentId,
        bytes: photo.bytes,
        contentType: photo.contentType,
        side: side,
      );
      if (!mounted) return;
      setState(() {
        st.state = CaptureState.uploaded;
        st.rejected = false;
        // After the front uploads the back is selected (and so on).
        _selected = _firstToCapture();
      });
    } on Object catch (e) {
      if (!mounted) return;
      final f = uploadFailure(e);
      setState(() {
        st.tooLarge = f.problem == PhotoProblem.tooLarge;
        if (st.tooLarge) st.photo = null;
        st.state = st.tooLarge ? CaptureState.empty : CaptureState.failed;
        _problem = f.problem;
        _message = f.message;
      });
    }
  }

  Future<void> _back() async {
    if (!widget.firstRun) {
      Navigator.of(context).pop();
      return;
    }
    final leave = await showNitumeConfirmDialog(
      context,
      title: OnboardIdCopy.leaveTitle,
      body: OnboardIdCopy.leaveBody,
      confirmLabel: OnboardIdCopy.leave,
      cancelLabel: OnboardIdCopy.stay,
      destructive: false,
    );
    if (leave && mounted) Nav.toShellTab(context, RunnerTab.jobs);
  }

  Widget? _notice() {
    switch (_problem) {
      case PhotoProblem.tooLarge:
        return tooLargeNotice(tail: CaptureCopy.tooLargeIdTail);
      case PhotoProblem.badType:
        return const NitumeNotice(message: CaptureCopy.badType);
      case PhotoProblem.bad:
        return const NitumeNotice(message: CaptureCopy.badPhoto);
      case null:
        break;
    }
    final m = _message;
    if (m != null) return NitumeNotice(message: m);
    final rejected = [
      for (final side in VerificationDocumentSide.values)
        if (_sides[side]!.rejected) side,
    ];
    if (rejected.length == 2) {
      return const NitumeNotice(message: OnboardIdCopy.rejectedBoth);
    }
    if (rejected.length == 1) {
      return NitumeNotice(message: OnboardIdCopy.rejectedSide(rejected.first));
    }
    return null;
  }

  CaptureThumbnail _tile(VerificationDocumentSide side) {
    final st = _sides[side]!;
    if (st.approved) {
      // Done (RN-L1): no thumbnail, not selectable, no Retake. A new upload
      // would replace the approved status (row 263 (a)).
      return CaptureThumbnail(
        key: ValueKey('id-tile-${side.wire}'),
        state: CaptureState.uploaded,
        label: side.label,
        aspectRatio: 1.4,
        showLabelOnPhoto: true,
        semanticLabel: 'ID ${side.wire}',
        caption: OnboardIdCopy.verified,
        captionStyle: CaptureCaptionStyle.text,
      );
    }
    final captured = st.state != CaptureState.empty;
    final CaptureIssue? issue = st.tooLarge
        ? CaptureIssue.tooLarge
        : (st.rejected && !captured ? CaptureIssue.notApproved : null);
    return CaptureThumbnail(
      key: ValueKey('id-tile-${side.wire}'),
      state: st.state,
      image: st.photo?.image,
      label: side.label,
      aspectRatio: 1.4,
      selected: _selected == side,
      // The side stays readable on the photo (front/back not swapped).
      showLabelOnPhoto: true,
      issue: issue,
      onRetake: issue == null ? null : () => _capture(side),
      retakeLabel: OnboardIdCopy.retake,
      semanticLabel: 'ID ${side.wire}',
      onTap: captured ? null : () => setState(() => _selected = side),
      onRemove: captured && st.state != CaptureState.uploading
          ? () => _capture(side)
          : null,
      removeLabel: OnboardIdCopy.retake,
      onRetry: st.state == CaptureState.failed
          ? (st.photo == null ? () => _capture(side) : () => _upload(side))
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final notice = _notice();
    final selected = _selected;
    final uploading = _sides.values.any(
      (s) => s.state == CaptureState.uploading,
    );
    return PopScope(
      canPop: !widget.firstRun,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: NitumeColors.slate,
        appBar: NitumePushedHeader(
          title: OnboardIdCopy.title,
          step: 1,
          totalSteps: 2,
          onBack: _back,
        ),
        body: _loading
            ? const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [SkeletonCard(height: 120), SizedBox(height: 12)],
                ),
              )
            : ListView(
                padding: const EdgeInsets.only(bottom: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                    child: Text(
                      OnboardIdCopy.intro,
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
                    child: CaptureThumbnailRow(
                      children: [
                        for (final side in VerificationDocumentSide.values)
                          _tile(side),
                      ],
                    ),
                  ),
                  if (selected != null && !_bothUploaded)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                      child: CaptureDropZone(
                        key: const ValueKey('id-drop-zone'),
                        title: OnboardIdCopy.sideLine(selected),
                        caption: OnboardIdCopy.dropZone,
                        icon: Icons.add_photo_alternate_outlined,
                        busy: uploading,
                        semanticLabel:
                            'Take a photo of your ID ${selected.wire}',
                        onPick: () => _capture(selected),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
                    child: Text(
                      OnboardIdCopy.hint,
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
            label: OnboardIdCopy.cta,
            expand: true,
            onPressed: _bothUploaded
                ? () => Nav.toOnboardSelfie(context)
                : null,
          ),
        ),
      ),
    );
  }
}
