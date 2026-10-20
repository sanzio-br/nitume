import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';
import '../api/runner_error_details.dart';

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

  /// Not sent; see [EvidenceUploadItem.fileMissing] and
  /// [EvidenceUploadItem.tooLarge]. Retry is possible unless the file is
  /// missing or too large.
  failed,
}

/// Which runner evidence a task state takes, mirroring the API's
/// `RUNNER_UPLOAD_STATES` (A5, rows 121, 129, 254). Use it for every
/// client-side guard (capture buttons, the capture screen) so the app and
/// the API agree; the API still answers 409 `evidence_not_allowed`
/// (`RunnerErrorDetails.evidenceRefusedStatus`) when the state moved.
///
/// Whether a job needs a receipt at all (`send_to_runner`) is the screen's
/// own rule on top of this.
abstract final class RunnerEvidenceRules {
  /// Photos: ARRIVED, IN_PROGRESS.
  static const photoStatuses = {ErrandStatus.arrived, ErrandStatus.inProgress};

  /// Receipts: ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER and DISPUTED (row
  /// 254: a receipt helps resolve the dispute; photos stay refused there).
  static const receiptStatuses = {
    ErrandStatus.arrived,
    ErrandStatus.inProgress,
    ErrandStatus.awaitingCustomer,
    ErrandStatus.disputed,
  };

  /// Receipts also after the task ended this way, only inside the 24 h
  /// window (row 129; the API answers 409 `reimbursement_window_closed`
  /// after it).
  static const receiptAfterEndStatuses = {
    ErrandStatus.cancelled,
    ErrandStatus.failed,
  };

  /// The runner evidence types [status] takes (photo, receipt; never
  /// video, row 121). [receiptWindowOpen]: whether the row-129 window is
  /// still open, for CANCELLED / FAILED (pass `false` once it closed).
  static Set<EvidenceType> allowedIn(
    ErrandStatus status, {
    bool receiptWindowOpen = true,
  }) => {
    if (photoStatuses.contains(status)) EvidenceType.photo,
    if (receiptStatuses.contains(status) ||
        (receiptWindowOpen && receiptAfterEndStatuses.contains(status)))
      EvidenceType.receipt,
  };

  /// True when [status] takes [type] (see [allowedIn]).
  static bool allows(
    ErrandStatus status,
    EvidenceType type, {
    bool receiptWindowOpen = true,
  }) => allowedIn(status, receiptWindowOpen: receiptWindowOpen).contains(type);
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
    CapturedImage? pickerCapture,
  }) : _picker = pickerCapture;

  final String errandId;
  final EvidenceType type;

  /// The photo's copy in app storage ([EvidenceFileStore.keep]), or the
  /// picker's own file when keeping failed ([keptInAppStorage] false).
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
  Object? _error;

  /// Set when keeping failed: [path] is the picker's file, outside the
  /// [EvidenceFileStore], so it is released with [CapturedImage.discard].
  final CapturedImage? _picker;

  /// False when [EvidenceFileStore.keep] failed and the item uses the
  /// picker's file. Such an item is never handed to the offline queue.
  bool get keptInAppStorage => _picker == null;

  EvidenceUploadStatus get status => _status;

  /// The server record once uploaded.
  Evidence? get evidence => _evidence;

  /// The photo is no longer on the phone: tell the runner to take it again
  /// (proposed copy: `This photo is no longer on your phone. Take it again.`).
  bool get fileMissing => _fileMissing;

  /// The server refused the photo as too large (413, row 252): it was not
  /// queued, its copy is already deleted (B-1) and [canRetry] is false. Show
  /// `RunnerEvidenceCopy.tooLarge(tooLargeError!.maxBytes)` and offer a
  /// new capture.
  bool get tooLarge => _tooLarge != null;

  /// The typed refusal behind [tooLarge]; `null` otherwise.
  EvidenceTooLarge? get tooLargeError => _tooLarge;
  EvidenceTooLarge? _tooLarge;

  /// Why the last attempt failed, while [status] is `failed`; `null`
  /// otherwise. A [NitumeApiException] for an API refusal (read it with
  /// [lastApiError]), a `FileSystemException` when the file is missing.
  Object? get lastError => _error;

  /// [lastError] when it is an API refusal: switch on its `code`
  /// (`evidence_not_allowed`, `reimbursement_window_closed`,
  /// `evidence_type_not_allowed`, a 413 …) and read typed details through
  /// `RunnerErrorDetails` (`evidenceRefusedStatus`, `receiptWindowEndsAt` …).
  NitumeApiException? get lastApiError => switch (_error) {
    final NitumeApiException e => e,
    _ => null,
  };

  /// Retry makes sense: failed, and the file is still there.
  bool get canRetry =>
      _status == EvidenceUploadStatus.failed && !_fileMissing && !tooLarge;

  /// Tile state for [CaptureThumbnail]: queued items still show as
  /// uploading (pair with the offline notice).
  CaptureState get captureState => switch (_status) {
    EvidenceUploadStatus.uploading ||
    EvidenceUploadStatus.queued => CaptureState.uploading,
    EvidenceUploadStatus.uploaded => CaptureState.uploaded,
    EvidenceUploadStatus.failed => CaptureState.failed,
  };

  void _set(
    EvidenceUploadStatus s, {
    Evidence? evidence,
    bool? missing,
    Object? error,
  }) {
    _status = s;
    _error = s == EvidenceUploadStatus.failed ? error : null;
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
///   file is the only copy: it is used as the item's path, released with
///   [CapturedImage.discard] wherever a kept copy would be deleted, and
///   never queued (a temporary failure leaves it `failed`, with retry).
/// * Uploaded: the kept copy is deleted.
/// * Temporary failure (offline, timeout, 5xx, 408, 429) with a [queue]:
///   the action is queued with the kept copy, which the queue's
///   `RunnerQueuedActions.cleanupFor` hook deletes later.
/// * Too large (413 `evidence_too_large`, row 252): permanent. The item is
///   `failed` with [EvidenceUploadItem.tooLarge], never queued, and its
///   copy is deleted at once (B-1); no retry.
/// * Refused: the item is `failed` and keeps its copy for [retry]; [remove]
///   or [dispose] deletes it (screens confirm before leaving, as the spec's
///   `Leave while uploading?` dialog).
/// * Missing file: `failed` with [EvidenceUploadItem.fileMissing].
/// * Disposed while an upload is in flight: the upload still runs to the
///   end and its file is cleaned up as above (a refusal then deletes the
///   copy, since nobody can retry it); no listener is called any more.
/// * Log out: a temporary failure after [dispose], or while the [queue] is
///   closed (`OfflineActionQueue.clear`, until its next `load`), is never
///   queued. The item fails; after [dispose] its copy is deleted at once,
///   otherwise when the uploader is released (`JobEvidenceUploads
///   .releaseAll`) or by `DirectoryEvidenceFileStore.discardAll`.
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
    CapturedImage? picker;
    try {
      kept = await files.keep(image.path);
      // B-1: the app keeps its own copy, so the picker's file (and any
      // scratch folder) goes at once.
      await _quietly(image.discard);
    } on FileSystemException {
      // The picker file is the only copy: it is used, and released with
      // image.discard() on every exit path (the store only deletes inside
      // its own folder).
      kept = image.path;
      picker = image;
    }
    final fix = await _fix();
    if (_disposed) {
      await _quietly(picker?.discard ?? () => files.discard(kept));
      return null;
    }
    final item = EvidenceUploadItem._(
      errandId: errandId,
      type: type,
      path: kept,
      pickerCapture: picker,
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
    await _quietly(item._picker?.discard ?? () => files.discard(item.path));
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
    Object? error,
  }) async {
    if (!_disposed) {
      item._set(s, evidence: evidence, missing: missing, error: error);
      notifyListeners();
      return;
    }
    item._status = s;
    item._error = s == EvidenceUploadStatus.failed ? error : null;
    item._evidence = evidence ?? item._evidence;
    item._fileMissing = missing ?? item._fileMissing;
    if (s == EvidenceUploadStatus.failed) await _release(item);
    item.dispose();
  }

  Future<void> _send(EvidenceUploadItem item) async {
    Uint8List bytes;
    try {
      bytes = await _read(item.path);
    } on FileSystemException catch (e) {
      await _finish(item, EvidenceUploadStatus.failed, missing: true, error: e);
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
      final big = EvidenceTooLarge.of(e);
      if (big != null) {
        // Row 252: the same file never fits. Not queued, not retried; the
        // copy goes now (B-1).
        item._tooLarge = big;
        await _release(item);
        await _finish(item, EvidenceUploadStatus.failed, error: e);
        return;
      }
      final q = queue;
      // Queue only while this uploader is open and the queue takes work:
      // after release / log out the copy must not outlive the session (B-1).
      // The queue deletes through the file store, which cannot delete the
      // picker's file: such an item stays here as failed (retry possible).
      if (q != null &&
          !_disposed &&
          !q.isClosed &&
          item.keptInAppStorage &&
          replayOutcomeFor(e) == ReplayOutcome.retryLater) {
        try {
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
        } on StateError {
          // Closed meanwhile (log out): not queued.
          await _finish(item, EvidenceUploadStatus.failed, error: e);
          return;
        }
        // The queue owns the file now.
        item._fileReleased = true;
        await _finish(item, EvidenceUploadStatus.queued);
      } else {
        await _finish(item, EvidenceUploadStatus.failed, error: e);
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
