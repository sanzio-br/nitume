import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/enums.dart';
import '../models/errand_activity.dart';
import '../storage/evidence_file_store.dart';
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

  /// Not sent; see [EvidenceUploadItem.fileMissing]. Retry is possible
  /// unless the file is missing.
  failed,
}

/// Runners upload photos and receipts only (row 121: no video).
void checkRunnerEvidenceType(EvidenceType type) {
  if (type != EvidenceType.photo && type != EvidenceType.receipt) {
    throw ArgumentError.value(
      type,
      'type',
      'Runners upload photos and receipts only',
    );
  }
}

/// One capture made in this session.
class EvidenceUploadItem extends ChangeNotifier {
  EvidenceUploadItem._({
    required this.errandId,
    required this.type,
    required this.path,
    required this.contentType,
    required this.capturedAt,
    this.lat,
    this.lon,
  });

  final String errandId;
  final EvidenceType type;

  /// The photo's copy in app storage ([EvidenceFileStore.keep]).
  final String path;
  final String contentType;

  /// UTC capture time (show with `formatClockEat`).
  final DateTime capturedAt;
  final double? lat;
  final double? lon;

  EvidenceUploadStatus _status = EvidenceUploadStatus.uploading;
  Evidence? _evidence;
  bool _fileMissing = false;
  bool _fileReleased = false;

  EvidenceUploadStatus get status => _status;

  /// The server record once uploaded.
  Evidence? get evidence => _evidence;

  /// The photo is no longer on the phone: tell the runner to take it again
  /// (proposed copy: `This photo is no longer on your phone. Take it again.`).
  bool get fileMissing => _fileMissing;

  /// Retry makes sense: failed, and the file is still there.
  bool get canRetry => _status == EvidenceUploadStatus.failed && !_fileMissing;

  /// Tile state for [CaptureThumbnail]: queued items still show as
  /// uploading (pair with the offline notice).
  CaptureState get captureState => switch (_status) {
    EvidenceUploadStatus.uploading ||
    EvidenceUploadStatus.queued => CaptureState.uploading,
    EvidenceUploadStatus.uploaded => CaptureState.uploaded,
    EvidenceUploadStatus.failed => CaptureState.failed,
  };

  void _set(EvidenceUploadStatus s, {Evidence? evidence, bool? missing}) {
    _status = s;
    _evidence = evidence ?? _evidence;
    _fileMissing = missing ?? _fileMissing;
    notifyListeners();
  }
}

/// R-22. Camera capture → compression (in [ImageCaptureSource]) → a copy in
/// app storage ([EvidenceFileStore]) → `POST /errands/:id/evidence` with
/// `capturedAt`, `lat`, `lon`; per-item state and retry.
///
/// * Kept: once [EvidenceFileStore.keep] succeeds, the picker's file is
///   deleted ([CapturedImage.discard], B-1). When keep fails, the picker
///   file is the only copy and is used as the kept path.
/// * Uploaded: the kept copy is deleted.
/// * Temporary failure (offline, timeout, 5xx, 408, 429) with a [queue]:
///   the action is queued with the kept copy, which the queue's
///   `RunnerQueuedActions.cleanupFor` hook deletes later.
/// * Refused: the item is `failed` and keeps its copy for [retry]; [remove]
///   or [dispose] deletes it (screens confirm before leaving, as the spec's
///   `Leave while uploading?` dialog).
/// * Missing file: `failed` with [EvidenceUploadItem.fileMissing].
/// * Disposed while an upload is in flight: the upload still runs to the
///   end and its file is cleaned up as above (a refusal then deletes the
///   copy, since nobody can retry it); no listener is called any more.
///
/// Lifetime (C-V2): hold one uploader per held job at app scope through
/// [JobEvidenceUploads], so leaving `v-evidence-capture` does not drop
/// uploads and `v-active` can read the item states.
///
/// Photos and receipts only (row 121): any other type throws
/// [ArgumentError]. Location is attached when the device has a fix; a
/// capture is never blocked on location.
class EvidenceUploader extends ChangeNotifier {
  EvidenceUploader({
    required this.capture,
    required this.upload,
    required this.files,
    this.positions,
    this.queue,
    Future<Uint8List> Function(String path)? readFile,
    DateTime Function()? clock,
    this.locationTimeout = const Duration(seconds: 3),
  }) : _read = readFile ?? ((p) => File(p).readAsBytes()),
       _clock = clock ?? DateTime.now;

  final ImageCaptureSource capture;
  final EvidenceUploadFn upload;
  final EvidenceFileStore files;
  final PositionSource? positions;
  final OfflineActionQueue? queue;
  final Duration locationTimeout;
  final Future<Uint8List> Function(String path) _read;
  final DateTime Function() _clock;

  final List<EvidenceUploadItem> _items = [];
  bool _disposed = false;

  /// True once [dispose] ran; [captureAndUpload] then returns `null`.
  bool get isDisposed => _disposed;

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

  /// Opens the camera and uploads the photo. `null` when cancelled. Throws
  /// [ArgumentError] for a type other than photo or receipt.
  Future<EvidenceUploadItem?> captureAndUpload(
    String errandId, {
    required EvidenceType type,
  }) async {
    checkRunnerEvidenceType(type);
    if (_disposed) return null;
    final image = await capture.takePhoto();
    if (image == null) return null;
    if (_disposed) {
      await _quietly(image.discard);
      return null;
    }
    final at = _clock().toUtc();
    String kept;
    try {
      kept = await files.keep(image.path);
      // B-1: the app keeps its own copy, so the picker's file (and any
      // scratch folder) goes at once.
      await _quietly(image.discard);
    } on FileSystemException {
      // The picker file is the only copy: it is used and released like a
      // kept copy.
      kept = image.path;
    }
    final fix = await _fix();
    if (_disposed) {
      await _quietly(() => files.discard(kept));
      return null;
    }
    final item = EvidenceUploadItem._(
      errandId: errandId,
      type: type,
      path: kept,
      contentType: image.contentType,
      capturedAt: at,
      lat: fix?.lat,
      lon: fix?.lng,
    );
    _items.add(item);
    notifyListeners();
    await _send(item);
    return item;
  }

  /// Retries a failed item whose file is still there.
  Future<void> retry(EvidenceUploadItem item) async {
    if (_disposed || !item.canRetry) return;
    item._set(EvidenceUploadStatus.uploading);
    notifyListeners();
    await _send(item);
  }

  /// Removes a failed item and deletes its kept copy (the runner gave up
  /// on it). Queued and uploaded items are not touched.
  Future<void> remove(EvidenceUploadItem item) async {
    if (_disposed || item.status != EvidenceUploadStatus.failed) return;
    _items.remove(item);
    await _release(item);
    item.dispose();
    notifyListeners();
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

  Future<void> _release(EvidenceUploadItem item) async {
    if (item._fileReleased) return;
    item._fileReleased = true;
    await _quietly(() => files.discard(item.path));
  }

  static Future<void> _quietly(Future<void> Function() f) async {
    try {
      await f();
    } on Object {
      // Best effort.
    }
  }

  /// Ends an item's send. After [dispose] the item is cleaned up instead:
  /// a failed copy is deleted (nobody can retry it) and the item disposed.
  Future<void> _finish(
    EvidenceUploadItem item,
    EvidenceUploadStatus s, {
    Evidence? evidence,
    bool? missing,
  }) async {
    if (!_disposed) {
      item._set(s, evidence: evidence, missing: missing);
      notifyListeners();
      return;
    }
    item._status = s;
    item._evidence = evidence ?? item._evidence;
    item._fileMissing = missing ?? item._fileMissing;
    if (s == EvidenceUploadStatus.failed) await _release(item);
    item.dispose();
  }

  Future<void> _send(EvidenceUploadItem item) async {
    Uint8List bytes;
    try {
      bytes = await _read(item.path);
    } on FileSystemException {
      await _finish(item, EvidenceUploadStatus.failed, missing: true);
      return;
    }
    try {
      final ev = await upload(
        item.errandId,
        type: item.type,
        bytes: bytes,
        contentType: item.contentType,
        capturedAt: item.capturedAt,
        lat: item.lat,
        lon: item.lon,
      );
      await _release(item);
      await _finish(item, EvidenceUploadStatus.uploaded, evidence: ev);
    } on Object catch (e) {
      final q = queue;
      if (q != null && replayOutcomeFor(e) == ReplayOutcome.retryLater) {
        await q.enqueue(
          QueuedActionKind.evidenceUpload,
          errandId: item.errandId,
          payload: RunnerQueuedActions.evidence(
            path: item.path,
            type: item.type,
            contentType: item.contentType,
            capturedAt: item.capturedAt,
            lat: item.lat,
            lon: item.lon,
          ),
        );
        // The queue owns the file now.
        item._fileReleased = true;
        await _finish(item, EvidenceUploadStatus.queued);
      } else {
        await _finish(item, EvidenceUploadStatus.failed);
      }
    }
  }

  /// Deletes failed copies and disposes settled items. Items still
  /// uploading finish in the background and clean up after themselves.
  @override
  void dispose() {
    _disposed = true;
    for (final i in _items) {
      if (i.status == EvidenceUploadStatus.uploading) continue;
      if (i.status == EvidenceUploadStatus.failed) unawaited(_release(i));
      i.dispose();
    }
    _items.clear();
    super.dispose();
  }
}
