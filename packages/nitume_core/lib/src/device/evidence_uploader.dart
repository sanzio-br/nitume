import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/enums.dart';
import '../models/errand_activity.dart';
import '../storage/offline_action_queue.dart';
import '../storage/runner_action_replay.dart';
import '../widgets/capture_widgets.dart';
import 'image_capture.dart';
import 'position_source.dart';

/// Sends one evidence image (normally `RunnerJobsRepository.uploadEvidence`).
typedef EvidenceUploadFn = Future<Evidence> Function(
  String errandId, {
  required EvidenceType type,
  required Uint8List bytes,
  required String contentType,
  DateTime? capturedAt,
  double? lat,
  double? lon,
});

/// Upload state of one capture.
enum EvidenceUploadStatus {
  uploading,
  uploaded,

  /// Saved on the phone; the offline queue sends it on reconnect.
  queued,
  failed,
}

/// One capture made in this session.
class EvidenceUploadItem extends ChangeNotifier {
  EvidenceUploadItem._({
    required this.errandId,
    required this.type,
    required this.image,
    required this.capturedAt,
    this.lat,
    this.lon,
  });

  final String errandId;
  final EvidenceType type;
  final CapturedImage image;

  /// UTC capture time (show with `formatClockEat`).
  final DateTime capturedAt;
  final double? lat;
  final double? lon;

  EvidenceUploadStatus _status = EvidenceUploadStatus.uploading;
  Evidence? _evidence;

  EvidenceUploadStatus get status => _status;

  /// The server record once uploaded.
  Evidence? get evidence => _evidence;

  /// Tile state for [CaptureThumbnail]: queued items still show as
  /// uploading (pair with the offline notice).
  CaptureState get captureState => switch (_status) {
    EvidenceUploadStatus.uploading ||
    EvidenceUploadStatus.queued => CaptureState.uploading,
    EvidenceUploadStatus.uploaded => CaptureState.uploaded,
    EvidenceUploadStatus.failed => CaptureState.failed,
  };

  void _set(EvidenceUploadStatus s, [Evidence? e]) {
    _status = s;
    _evidence = e ?? _evidence;
    notifyListeners();
  }
}

/// R-22. Camera capture → compression (in [ImageCaptureSource]) →
/// `POST /errands/:id/evidence` with `capturedAt`, `lat`, `lon`; per-item
/// state and retry; offline captures go through the [OfflineActionQueue]
/// when one is given.
///
/// Photos and receipts only (row 121: no video). Location is attached when
/// the device has a fix; a capture is never blocked on location (RQ-11
/// leaves it optional).
class EvidenceUploader extends ChangeNotifier {
  EvidenceUploader({
    required this.capture,
    required this.upload,
    this.positions,
    this.queue,
    Future<Uint8List> Function(String path)? readFile,
    DateTime Function()? clock,
    this.locationTimeout = const Duration(seconds: 3),
  }) : _read = readFile ?? ((p) => File(p).readAsBytes()),
       _clock = clock ?? DateTime.now;

  final ImageCaptureSource capture;
  final EvidenceUploadFn upload;
  final PositionSource? positions;
  final OfflineActionQueue? queue;
  final Duration locationTimeout;
  final Future<Uint8List> Function(String path) _read;
  final DateTime Function() _clock;

  final List<EvidenceUploadItem> _items = [];

  /// This session's captures, oldest first.
  List<EvidenceUploadItem> get items => List.unmodifiable(_items);

  /// True while any item is still uploading.
  bool get busy =>
      _items.any((i) => i.status == EvidenceUploadStatus.uploading);

  /// `Save to task` is enabled when every capture is uploaded or queued.
  bool get allSettled => _items.every(
    (i) =>
        i.status == EvidenceUploadStatus.uploaded ||
        i.status == EvidenceUploadStatus.queued,
  );

  /// Opens the camera and uploads the photo. `null` when cancelled.
  Future<EvidenceUploadItem?> captureAndUpload(
    String errandId, {
    required EvidenceType type,
  }) async {
    assert(
      type == EvidenceType.photo || type == EvidenceType.receipt,
      'Runners capture photos and receipts only',
    );
    final image = await capture.takePhoto();
    if (image == null) return null;
    final at = _clock().toUtc();
    final fix = await _fix();
    final item = EvidenceUploadItem._(
      errandId: errandId,
      type: type,
      image: image,
      capturedAt: at,
      lat: fix?.lat,
      lon: fix?.lng,
    );
    _items.add(item);
    notifyListeners();
    await _send(item);
    return item;
  }

  /// Retries a failed item.
  Future<void> retry(EvidenceUploadItem item) async {
    if (item.status != EvidenceUploadStatus.failed) return;
    item._set(EvidenceUploadStatus.uploading);
    notifyListeners();
    await _send(item);
  }

  Future<DevicePosition?> _fix() async {
    final source = positions;
    if (source == null) return null;
    try {
      return await source.current().timeout(locationTimeout);
    } on Object {
      return null;
    }
  }

  Future<void> _send(EvidenceUploadItem item) async {
    try {
      final bytes = await _read(item.image.path);
      final ev = await upload(
        item.errandId,
        type: item.type,
        bytes: bytes,
        contentType: item.image.contentType,
        capturedAt: item.capturedAt,
        lat: item.lat,
        lon: item.lon,
      );
      item._set(EvidenceUploadStatus.uploaded, ev);
    } on Object catch (e) {
      final q = queue;
      if (q != null && replayOutcomeFor(e) == ReplayOutcome.retryLater) {
        await q.enqueue(
          QueuedActionKind.evidenceUpload,
          errandId: item.errandId,
          payload: RunnerQueuedActions.evidence(
            path: item.image.path,
            type: item.type,
            contentType: item.image.contentType,
            capturedAt: item.capturedAt,
            lat: item.lat,
            lon: item.lon,
          ),
        );
        item._set(EvidenceUploadStatus.queued);
      } else {
        item._set(EvidenceUploadStatus.failed);
      }
    }
    notifyListeners();
  }

  @override
  void dispose() {
    for (final i in _items) {
      i.dispose();
    }
    super.dispose();
  }
}
