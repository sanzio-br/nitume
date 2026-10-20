import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/active_jobs.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import 'active_presentation.dart';

/// `v-evidence-capture` copy (mockup copy where the spec says so, the rest
/// proposed).
abstract final class EvidenceCopy {
  static const title = 'Capture evidence';
  static const receiptTitle = 'Upload receipt';
  static const photo = 'Photo';
  static const receipt = 'Receipt';
  static const dropZone = 'Tap to take a photo';
  static const shutter = 'Take photo';
  static const info =
      'Photos upload immediately and are timestamped & geo-tagged '
      "automatically — this is what builds the task's evidence timeline.";
  static const receiptHint =
      'Make sure the total and the shop name are readable.';
  static const save = 'Save to task';
  static const remove = 'Remove';
  static const offline =
      "Saved on your phone. We'll upload it when you're back online.";
  static const locationOff =
      'Location is off. Photos will upload without a location.';
  static const cameraOffTitle = 'Camera access is off';
  static const cameraOffBody =
      'Allow camera access in Settings to take photos.';
  static const openSettings = 'Open Settings';
  static const notAllowed = "You can't add photos to this job any more.";
  static const tooLarge = "This photo couldn't be uploaded. Try again later.";
  static const windowClosed =
      'The upload window has closed. Contact support with your receipt.';
  static const stay = 'Stay';
  static const leave = 'Leave';
  static String leaveTitle(int n) =>
      n == 1 ? 'Leave without 1 photo?' : 'Leave without $n photos?';
  static String leaveBody(int n) => n == 1
      ? "1 photo didn't upload. It'll be deleted from your phone."
      : "$n photos didn't upload. They'll be deleted from your phone.";
}

/// Evidence types a state accepts (spec Task states; the API enforces it
/// too, `evidence_not_allowed`).
Set<EvidenceType> allowedEvidence(RunnerJobView job, ErrandStatus status) =>
    switch (status) {
      ErrandStatus.arrived || ErrandStatus.inProgress => {
        EvidenceType.photo,
        if (needsReceipt(job)) EvidenceType.receipt,
      },
      ErrandStatus.awaitingCustomer ||
      ErrandStatus.cancelled ||
      ErrandStatus.failed => {if (needsReceipt(job)) EvidenceType.receipt},
      _ => const {},
    };

/// `v-evidence-capture`: camera only (no gallery, so time and place stay
/// trustworthy), each photo uploads at once through the job's R-22
/// uploader, which outlives this screen (C-V2).
class EvidenceCaptureScreen extends StatefulWidget {
  const EvidenceCaptureScreen({
    super.key,
    required this.errandId,
    required this.type,
  });

  final String errandId;
  final EvidenceType type;

  @override
  State<EvidenceCaptureScreen> createState() => _EvidenceCaptureScreenState();
}

class _EvidenceCaptureScreenState extends State<EvidenceCaptureScreen> {
  late EvidenceType _type = widget.type;
  late final AppServices _s = AppScope.read(context);

  /// The job's app-scope uploader; created after the first frame (creating
  /// it notifies `v-active`, which must not happen during a build).
  EvidenceUploader? _up;
  EvidenceUploader get _uploader => _up!;
  List<Evidence> _existing = const [];
  CameraAccess _camera = CameraAccess.granted;
  bool _locationOff = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _up = _s.uploads.forJob(widget.errandId));
      _uploader.addListener(_onUploads);
      _s.active.addListener(_onUploads);
      _load();
    });
  }

  @override
  void dispose() {
    final up = _up;
    if (up != null && !up.isDisposed) up.removeListener(_onUploads);
    _s.active.removeListener(_onUploads);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final ev = await _s.jobs.evidence(widget.errandId);
      if (mounted) setState(() => _existing = ev);
    } on Object {
      // Uploaded items still show from this session.
    }
    try {
      final access = await _s.location.access();
      if (mounted) {
        setState(
          () => _locationOff =
              access != LocationAccess.whileInUse &&
              access != LocationAccess.always,
        );
      }
    } on Object {
      // Never blocks the capture.
    }
    final cam = await _s.permissions.camera();
    if (mounted) setState(() => _camera = cam);
  }

  void _onUploads() {
    if (!mounted) return;
    NitumeApiException? e;
    for (final i in _uploader.items.reversed) {
      if (i.status == EvidenceUploadStatus.failed && i.lastApiError != null) {
        e = i.lastApiError;
        break;
      }
    }
    final error = e;
    setState(() => _error = error != null ? _messageFor(error) : _error);
  }

  String _messageFor(Object e) {
    if (RunnerJobsRepository.isAccessRevoked(e)) {
      _s.active.revoke(widget.errandId);
      return ActiveJobsCopy.revoked;
    }
    if (e is NitumeApiException) {
      if (e.isPayloadTooLarge) return EvidenceCopy.tooLarge;
      if (e.code == ApiErrorCodes.evidenceNotAllowed) {
        unawaited(_s.active.load());
        return EvidenceCopy.notAllowed;
      }
      if (e.code == ApiErrorCodes.reimbursementWindowClosed) {
        return EvidenceCopy.windowClosed;
      }
    }
    return friendlyError(e);
  }

  Future<void> _capture() async {
    if (_camera != CameraAccess.granted) {
      final now = await _s.permissions.requestCamera();
      if (!mounted) return;
      setState(() => _camera = now);
      if (now != CameraAccess.granted) return;
    }
    setState(() => _error = null);
    await _uploader.captureAndUpload(widget.errandId, type: _type);
  }

  List<EvidenceUploadItem> get _failed => [
    for (final i in _up?.items ?? const <EvidenceUploadItem>[])
      if (i.status == EvidenceUploadStatus.failed) i,
  ];

  Future<void> _back() async {
    final failed = _failed;
    if (failed.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    final leave = await showNitumeConfirmDialog(
      context,
      title: EvidenceCopy.leaveTitle(failed.length),
      body: EvidenceCopy.leaveBody(failed.length),
      confirmLabel: EvidenceCopy.leave,
      cancelLabel: EvidenceCopy.stay,
    );
    if (!leave || !mounted) return;
    // B-1 rule 4: a failed copy left behind is deleted.
    for (final i in failed) {
      await _uploader.remove(i);
    }
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final job = _s.active.byId(widget.errandId);
    final status = job == null ? null : _s.active.statusOf(job);
    final allowed = job == null || status == null
        ? const <EvidenceType>{}
        : allowedEvidence(job, status);
    final canCapture = allowed.contains(_type);
    final items = [
      for (final i in (_up == null || _up!.isDisposed) ? const [] : _up!.items)
        if (i.type == _type) i,
    ];
    final uploadedIds = {
      for (final i in items)
        if (i.evidence != null) i.evidence!.id,
    };
    final existing = [
      for (final e in _existing)
        if (e.type == _type && !uploadedIds.contains(e.id))
          EvidenceThumbnail(imageUrl: e.url),
    ];
    final queued = items.any((i) => i.status == EvidenceUploadStatus.queued);
    const pad = EdgeInsets.fromLTRB(20, 0, 20, 12);
    final error = _error;
    final title = widget.type == EvidenceType.receipt
        ? EvidenceCopy.receiptTitle
        : EvidenceCopy.title;
    return PopScope(
      canPop: _failed.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: NitumeColors.slate,
        appBar: NitumePushedHeader(title: title, onBack: _back),
        body: ListView(
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            if (error != null)
              Padding(
                padding: pad,
                child: NitumeNotice(
                  message: error,
                  tone: NitumeNoticeTone.danger,
                ),
              ),
            if (!canCapture)
              const Padding(
                padding: pad,
                child: NitumeNotice(message: EvidenceCopy.notAllowed),
              )
            else ...[
              if (allowed.length > 1)
                Padding(
                  padding: pad,
                  child: Row(
                    children: [
                      for (final t in [
                        EvidenceType.photo,
                        EvidenceType.receipt,
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: NitumeChoiceChip(
                            label: t == EvidenceType.photo
                                ? EvidenceCopy.photo
                                : EvidenceCopy.receipt,
                            selected: _type == t,
                            onSelected: () => setState(() => _type = t),
                          ),
                        ),
                    ],
                  ),
                ),
              if (queued)
                const Padding(
                  padding: pad,
                  child: NitumeNotice(message: EvidenceCopy.offline),
                ),
              if (_locationOff)
                const Padding(
                  padding: pad,
                  child: NitumeNotice(message: EvidenceCopy.locationOff),
                ),
              if (_camera == CameraAccess.deniedForever) ...[
                const NitumeEmptyState(
                  title: EvidenceCopy.cameraOffTitle,
                  message: EvidenceCopy.cameraOffBody,
                ),
                Center(
                  child: NitumeButton.outline(
                    label: EvidenceCopy.openSettings,
                    onPressed: () => _s.permissions.openSettings(),
                  ),
                ),
              ] else
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: CaptureDropZone(
                    key: const ValueKey('evidence-drop-zone'),
                    caption: EvidenceCopy.dropZone,
                    height: 240,
                    semanticLabel: EvidenceCopy.shutter,
                    onPick: _up == null ? null : _capture,
                  ),
                ),
            ],
            if (items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final (n, i) in items.indexed)
                      SizedBox(
                        width: 100,
                        child: CaptureThumbnail(
                          key: ValueKey('evidence-item-$n'),
                          state: i.captureState,
                          image: FileImage(File(i.path)),
                          caption: formatClockEat(i.capturedAt),
                          semanticLabel: 'Photo ${n + 1} of ${items.length}',
                          onRetry: i.canRetry ? () => _uploader.retry(i) : null,
                          onRemove: i.status == EvidenceUploadStatus.failed
                              ? () => _uploader.remove(i)
                              : null,
                          removeLabel: EvidenceCopy.remove,
                        ),
                      ),
                  ],
                ),
              ),
            if (existing.isNotEmpty)
              EvidenceGrid(
                items: existing,
                onTap: (i) => EvidenceViewer.show(
                  context,
                  items: existing,
                  initialIndex: i,
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                EvidenceCopy.info,
                style: NitumeTextStyles.mutedSmall,
              ),
            ),
            if (_type == EvidenceType.receipt)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: Text(
                  EvidenceCopy.receiptHint,
                  style: NitumeTextStyles.mutedSmall,
                ),
              ),
          ],
        ),
        bottomNavigationBar: NitumeFixedCta(
          child: NitumeButton.primary(
            label: EvidenceCopy.save,
            expand: true,
            onPressed: _up == null || _up!.isDisposed || _up!.allSettled
                ? () => Navigator.of(context).pop()
                : null,
          ),
        ),
      ),
    );
  }
}
