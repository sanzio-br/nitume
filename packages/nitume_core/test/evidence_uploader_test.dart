import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// A capture that records [discard] calls (and still deletes the file).
class _RecordingImage extends CapturedImage {
  _RecordingImage(String path, this.log) : super(path: path);

  final List<String> log;

  @override
  Future<void> discard() async {
    log.add(path);
    await super.discard();
  }
}

class _Camera implements ImageCaptureSource {
  _Camera(this.dir);

  final Directory dir;
  bool cancel = false;
  int n = 0;
  final discarded = <String>[];

  /// Simulates image_picker writing a compressed file to its cache.
  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    if (cancel) return null;
    final f = File('${dir.path}/picker_${n++}.jpg')
      ..writeAsBytesSync(List.filled(10, 7));
    return _RecordingImage(f.path, discarded);
  }
}

class _Fix implements PositionSource {
  @override
  Future<LocationAccess> access() async => LocationAccess.whileInUse;
  @override
  Future<LocationAccess> requestAccess() async => LocationAccess.whileInUse;
  @override
  Future<DevicePosition?> current() async =>
      DevicePosition(lat: -4.03, lng: 39.71, timestamp: DateTime.utc(2026));
  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) => const Stream.empty();
}

/// A queue store whose reads always fail; counts writes.
class _UnreadableStore implements QueueStore {
  List<String> entries = [];
  int writes = 0;

  @override
  Future<List<String>> read() async =>
      throw const FileSystemException('unreadable');

  @override
  Future<void> write(List<String> entries) async {
    writes++;
    this.entries = List.of(entries);
  }
}

/// Waits (up to ~2 s) for background file clean-up, which runs unawaited
/// after dispose.
Future<void> _until(bool Function() done) async {
  for (var i = 0; i < 400 && !done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
}

void main() {
  final now = DateTime.utc(2026, 10, 13, 7, 31);
  late Directory cache;
  late Directory app;
  late _Camera camera;
  late DirectoryEvidenceFileStore files;
  Object? failWith;
  Completer<void>? gate;
  late List<({EvidenceType type, int bytes, DateTime? at, double? lat})> calls;

  Future<Evidence> upload(
    String errandId, {
    required EvidenceType type,
    required Uint8List bytes,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
  }) async {
    calls.add((type: type, bytes: bytes.length, at: capturedAt, lat: lat));
    final g = gate;
    if (g != null) await g.future;
    final f = failWith;
    if (f != null) throw f;
    return Evidence(id: 'ev${calls.length}', errandId: errandId, type: type);
  }

  setUp(() {
    cache = Directory.systemTemp.createTempSync('cache');
    app = Directory.systemTemp.createTempSync('app');
    camera = _Camera(cache);
    files = DirectoryEvidenceFileStore(() async => app);
    calls = [];
    failWith = null;
    gate = null;
  });

  tearDown(() {
    cache.deleteSync(recursive: true);
    app.deleteSync(recursive: true);
  });

  List<FileSystemEntity> kept() {
    final d = Directory('${app.path}/nitume_evidence');
    return d.existsSync() ? d.listSync() : const [];
  }

  EvidenceUploader make({OfflineActionQueue? queue}) => EvidenceUploader(
    capture: camera,
    upload: upload,
    files: files,
    positions: _Fix(),
    queue: queue,
    clock: () => now,
  );

  test('uploads from the kept copy with time and location, then deletes '
      'it', () async {
    final u = make();
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(item!.status, EvidenceUploadStatus.uploaded);
    expect(item.path, startsWith(app.path));
    expect(calls.single.bytes, 10);
    expect(calls.single.at, now);
    expect(calls.single.lat, -4.03);
    expect(kept(), isEmpty);
    expect(u.allSettled, isTrue);
  });

  test('B-1: the picker file is discarded once the copy is kept', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'bad', statusCode: 422);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(camera.discarded, hasLength(1));
    expect(camera.discarded.single, isNot(item!.path));
    expect(File(camera.discarded.single).existsSync(), isFalse);
    expect(cache.listSync(), isEmpty, reason: 'no camera file in the cache');
    expect(kept(), hasLength(1), reason: 'the kept copy stays for retry');
  });

  group('keep fails (real store): the picker file is released on every '
      'exit path', () {
    late File blocker;

    /// A real [DirectoryEvidenceFileStore] whose base is a regular file, so
    /// keep (and its own discard) fail as on a full or broken disk.
    EvidenceUploader broken({OfflineActionQueue? queue}) {
      blocker = File('${app.path}/not_a_dir')..writeAsStringSync('x');
      return EvidenceUploader(
        capture: camera,
        upload: upload,
        files: DirectoryEvidenceFileStore(() async => Directory(blocker.path)),
        queue: queue,
        clock: () => now,
      );
    }

    bool pickerFilesLeft() => cache.listSync().whereType<File>().isNotEmpty;

    test('uploaded: the picker file is deleted', () async {
      final u = broken();
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.keptInAppStorage, isFalse);
      expect(item.path, startsWith(cache.path));
      expect(item.status, EvidenceUploadStatus.uploaded);
      expect(calls.single.bytes, 10);
      expect(camera.discarded, [item.path]);
      expect(pickerFilesLeft(), isFalse);
    });

    test('refused: kept for retry, deleted on remove', () async {
      final u = broken();
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(pickerFilesLeft(), isTrue);
      await u.remove(item);
      expect(pickerFilesLeft(), isFalse);
    });

    test('refused, then the uploader is released (leave, log out): '
        'deleted', () async {
      final uploads = JobEvidenceUploads((_) => broken());
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      await uploads
          .forJob('e1')
          .captureAndUpload('e1', type: EvidenceType.photo);
      expect(pickerFilesLeft(), isTrue);
      uploads.releaseAll();
      await _until(() => !pickerFilesLeft());
      expect(pickerFilesLeft(), isFalse);
    });

    test('offline with a queue: not queued (the queue cannot delete it), '
        'failed with retry, deleted on dispose', () async {
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async => ReplayOutcome.done,
      );
      final u = broken(queue: queue);
      failWith = const NitumeApiException(message: 'x', statusCode: 503);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(item.canRetry, isTrue);
      expect(queue.pending, isEmpty);
      u.dispose();
      await _until(() => !pickerFilesLeft());
      expect(pickerFilesLeft(), isFalse);
    });

    test('released while uploading, then refused: deleted', () async {
      final u = broken();
      gate = Completer<void>();
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      final pending = u.captureAndUpload('e1', type: EvidenceType.photo);
      for (var i = 0; i < 500 && calls.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 2));
      }
      u.dispose();
      gate!.complete();
      await pending;
      expect(pickerFilesLeft(), isFalse);
    });
  });

  test('video is refused at runtime', () {
    expect(
      () => make().captureAndUpload('e1', type: EvidenceType.video),
      throwsArgumentError,
    );
  });

  test('cancelled capture adds nothing', () async {
    camera.cancel = true;
    final u = make();
    expect(await u.captureAndUpload('e1', type: EvidenceType.photo), isNull);
    expect(u.items, isEmpty);
  });

  test('refused: failed, copy kept for retry; remove deletes it', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'bad', statusCode: 422);
    final item = await u.captureAndUpload('e1', type: EvidenceType.receipt);
    expect(item!.status, EvidenceUploadStatus.failed);
    expect(item.canRetry, isTrue);
    expect(kept(), hasLength(1));
    failWith = null;
    await u.retry(item);
    expect(item.status, EvidenceUploadStatus.uploaded);
    expect(kept(), isEmpty);

    failWith = const NitumeApiException(message: 'bad', statusCode: 422);
    final second = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(kept(), hasLength(1));
    await u.remove(second!);
    expect(kept(), isEmpty);
    expect(u.items, hasLength(1));
  });

  test('the cache copy can vanish: the kept copy still uploads', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'bad', statusCode: 422);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    cache.listSync().forEach((f) => f.deleteSync());
    failWith = null;
    await u.retry(item!);
    expect(item.status, EvidenceUploadStatus.uploaded);
  });

  test('a missing kept file is reported, not retried', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'bad', statusCode: 422);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    for (final f in kept()) {
      f.deleteSync();
    }
    failWith = null;
    // Simulate a retry attempt that finds no file.
    await u.retry(item!);
    expect(item.status, EvidenceUploadStatus.failed);
    expect(item.fileMissing, isTrue);
    expect(item.canRetry, isFalse);
  });

  test('offline (or 503) goes to the queue, which owns and later deletes '
      'the copy', () async {
    late OfflineActionQueue queue;
    queue = OfflineActionQueue(
      store: InMemoryQueueStore(),
      runner: (_) async => ReplayOutcome.done,
      onSettled: RunnerQueuedActions.cleanupFor(files),
    );
    final u = make(queue: queue);
    failWith = const NitumeApiException(message: 'x', statusCode: 503);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(item!.status, EvidenceUploadStatus.queued);
    expect(u.allSettled, isTrue);
    expect(queue.pending.single.payload['path'], item.path);
    u.dispose();
    expect(kept(), hasLength(1), reason: 'the queue owns it');
    await queue.replay();
    expect(kept(), isEmpty);
  });

  test('offline without a queue is a plain failure', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'x', isNetworkError: true);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(item!.status, EvidenceUploadStatus.failed);
  });

  group('C-V2: uploads outlive the screen', () {
    /// Real file I/O runs before the upload call: wait for it.
    Future<void> untilUploading() async {
      for (var i = 0; i < 500 && calls.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 2));
      }
      expect(calls, isNotEmpty);
    }

    test('disposed while uploading: the upload finishes and the copy is '
        'deleted, no listener after dispose', () async {
      final u = make();
      var notified = 0;
      gate = Completer<void>();
      final pending = u.captureAndUpload('e1', type: EvidenceType.photo);
      await untilUploading();
      expect(u.busy, isTrue);
      final item = u.items.single;
      item.addListener(() => notified++);
      u.dispose();
      expect(u.isDisposed, isTrue);
      gate!.complete();
      final done = await pending;
      expect(done, same(item));
      expect(item.status, EvidenceUploadStatus.uploaded);
      expect(calls, hasLength(1));
      expect(kept(), isEmpty);
      expect(notified, 0);
    });

    test('disposed while uploading, then refused: the copy is deleted '
        '(nobody can retry)', () async {
      final u = make();
      gate = Completer<void>();
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      final pending = u.captureAndUpload('e1', type: EvidenceType.photo);
      await untilUploading();
      expect(kept(), hasLength(1));
      u.dispose();
      gate!.complete();
      final item = await pending;
      expect(item!.status, EvidenceUploadStatus.failed);
      await _until(() => kept().isEmpty);
      expect(kept(), isEmpty);
    });

    test('released (log out) while uploading, then offline: never queued, '
        'the copy is deleted', () async {
      final store = InMemoryQueueStore();
      final queue = OfflineActionQueue(
        store: store,
        runner: (_) async => ReplayOutcome.done,
        onSettled: RunnerQueuedActions.cleanupFor(files),
      );
      final u = make(queue: queue);
      gate = Completer<void>();
      failWith = const NitumeApiException(message: 'x', statusCode: 503);
      final pending = u.captureAndUpload('e1', type: EvidenceType.photo);
      await untilUploading();
      u.dispose();
      gate!.complete();
      expect((await pending)!.status, EvidenceUploadStatus.failed);
      expect(queue.pending, isEmpty);
      expect(await store.read(), isEmpty, reason: 'nothing persisted');
      await _until(() => kept().isEmpty);
      expect(kept(), isEmpty);
    });

    test('log out order: queue cleared while uploading, then offline: not '
        'queued (closed queue), copy deleted on release', () async {
      final store = InMemoryQueueStore();
      final queue = OfflineActionQueue(
        store: store,
        runner: (_) async => ReplayOutcome.done,
        onSettled: RunnerQueuedActions.cleanupFor(files),
      );
      final uploads = JobEvidenceUploads((_) => make(queue: queue));
      gate = Completer<void>();
      failWith = const NitumeApiException(message: 'x', statusCode: 503);
      final pending = uploads
          .forJob('e1')
          .captureAndUpload('e1', type: EvidenceType.photo);
      await untilUploading();
      await queue.clear(); // endSession
      gate!.complete();
      final item = await pending;
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(queue.pending, isEmpty);
      expect(await store.read(), isEmpty, reason: 'nothing persisted');
      uploads.releaseAll();
      await files.discardAll();
      await _until(() => kept().isEmpty);
      expect(kept(), isEmpty);

      // Next sign-in: the queue reopens on load and holds nothing.
      await queue.load();
      expect(queue.isClosed, isFalse);
      expect(queue.pending, isEmpty);
    });

    test('the enqueue refused by a queue closed mid-flight is a failure, '
        'not an error', () async {
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async => ReplayOutcome.done,
      );
      final u = make(queue: queue);
      await queue.clear();
      failWith = const NitumeApiException(message: 'x', statusCode: 503);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(item.canRetry, isTrue);
      expect(queue.pending, isEmpty);
    });

    test('a queue whose store could not be read: not queued, the stored '
        'queue is untouched, the copy goes with the uploader (B-1)', () async {
      final store = _UnreadableStore()..entries = ['{"stored":true}'];
      final queue = OfflineActionQueue(
        store: store,
        runner: (_) async => ReplayOutcome.done,
        onSettled: RunnerQueuedActions.cleanupFor(files),
      );
      await expectLater(queue.load(), throwsA(isA<FileSystemException>()));
      expect(queue.isClosed, isTrue);
      final u = make(queue: queue);
      failWith = const NitumeApiException(message: 'x', isNetworkError: true);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(item.canRetry, isTrue);
      expect(queue.pending, isEmpty);
      expect(store.writes, 0, reason: 'the unread queue is never overwritten');
      expect(store.entries, ['{"stored":true}']);
      expect(kept(), hasLength(1), reason: 'kept for a retry');
      u.dispose();
      await _until(() => kept().isEmpty);
      expect(kept(), isEmpty);
    });

    test('a disposed uploader takes no new capture', () async {
      final u = make()..dispose();
      expect(await u.captureAndUpload('e1', type: EvidenceType.photo), isNull);
      expect(calls, isEmpty);
    });

    test('JobEvidenceUploads: one uploader per job, kept across screens, '
        'released with the job', () async {
      final created = <String>[];
      final uploads = JobEvidenceUploads((id) {
        created.add(id);
        return make();
      });
      var changes = 0;
      uploads.addListener(() => changes++);
      expect(uploads.existing('e1'), isNull);
      final a = uploads.forJob('e1');
      expect(uploads.forJob('e1'), same(a));
      expect(uploads.existing('e1'), same(a));
      uploads.forJob('e2');
      expect(created, ['e1', 'e2']);
      expect(uploads.jobIds, {'e1', 'e2'});
      expect(changes, 2);

      // The screen captures, then is left while the upload is in flight.
      gate = Completer<void>();
      final pending = a.captureAndUpload('e1', type: EvidenceType.photo);
      await untilUploading();
      // v-active reads the state from the same uploader.
      expect(uploads.existing('e1')!.busy, isTrue);
      gate!.complete();
      await pending;
      expect(
        uploads.existing('e1')!.items.single.status,
        EvidenceUploadStatus.uploaded,
      );

      uploads.retainOnly(['e1']);
      expect(uploads.jobIds, {'e1'});
      uploads.release('e1');
      expect(a.isDisposed, isTrue);
      expect(uploads.jobIds, isEmpty);
      expect(changes, 4);
      uploads.dispose();
      expect(() => uploads.forJob('e3'), throwsStateError);
    });

    test('JobEvidenceUploads.releaseAll disposes every uploader', () {
      final made = <EvidenceUploader>[];
      final uploads = JobEvidenceUploads((_) {
        final u = make();
        made.add(u);
        return u;
      });
      uploads
        ..forJob('e1')
        ..forJob('e2')
        ..releaseAll();
      expect(made.every((u) => u.isDisposed), isTrue);
      expect(uploads.jobIds, isEmpty);
    });
  });

  group('lastError', () {
    test('a refusal is kept with its code and typed details, cleared on '
        'retry success', () async {
      final u = make();
      failWith = const NitumeApiException(
        message: 'closed',
        statusCode: 409,
        code: ApiErrorCodes.reimbursementWindowClosed,
        details: {'windowEndsAt': '2026-10-19T09:00:00.000Z'},
      );
      final item = await u.captureAndUpload('e1', type: EvidenceType.receipt);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(item.lastApiError!.code, ApiErrorCodes.reimbursementWindowClosed);
      expect(
        item.lastApiError!.receiptWindowEndsAt,
        DateTime.utc(2026, 10, 19, 9),
      );
      expect(item.lastError, same(failWith));
      failWith = null;
      await u.retry(item);
      expect(item.status, EvidenceUploadStatus.uploaded);
      expect(item.lastError, isNull);
      expect(item.lastApiError, isNull);
    });

    test('a missing file is a FileSystemException, not an API error', () async {
      final u = make();
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      for (final f in kept()) {
        f.deleteSync();
      }
      await u.retry(item!);
      expect(item.fileMissing, isTrue);
      expect(item.lastError, isA<FileSystemException>());
      expect(item.lastApiError, isNull);
    });

    test('queued items carry no error', () async {
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async => ReplayOutcome.done,
      );
      final u = make(queue: queue);
      failWith = const NitumeApiException(message: 'x', statusCode: 503);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.queued);
      expect(item.lastError, isNull);
    });
  });

  group('evidence_too_large (row 252)', () {
    const tooLarge = NitumeApiException(
      message: 'The file is larger than the limit',
      statusCode: 413,
      code: 'evidence_too_large',
      details: {'maxBytes': 10485760},
    );

    test(
      'failed, not retryable, copy deleted at once, typed maxBytes',
      () async {
        final u = make();
        failWith = tooLarge;
        final item = await u.captureAndUpload('e1', type: EvidenceType.receipt);
        expect(item!.status, EvidenceUploadStatus.failed);
        expect(item.tooLarge, isTrue);
        expect(item.tooLargeError, const EvidenceTooLarge(maxBytes: 10485760));
        expect(item.canRetry, isFalse);
        expect(item.lastApiError?.code, ApiErrorCodes.evidenceTooLarge);
        expect(kept(), isEmpty, reason: 'B-1: nothing kept that cannot upload');
        expect(camera.discarded, hasLength(1));

        failWith = null;
        await u.retry(item);
        expect(calls, hasLength(1), reason: 'never retried');
        await u.remove(item);
        expect(u.items, isEmpty);
      },
    );

    test('never queued, even with a queue', () async {
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async => ReplayOutcome.done,
      );
      final u = make(queue: queue);
      failWith = const NitumeApiException(message: 'x', statusCode: 413);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.status, EvidenceUploadStatus.failed);
      expect(item.tooLarge, isTrue);
      expect(
        item.tooLargeError!.maxBytes,
        EvidenceTooLarge.defaultMaxBytes,
        reason: 'a bare 413 falls back to the API default',
      );
      expect(queue.pending, isEmpty);
      expect(kept(), isEmpty);
    });

    test('a later failure of another kind is not too large', () async {
      final u = make();
      failWith = const NitumeApiException(message: 'bad', statusCode: 422);
      final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
      expect(item!.tooLarge, isFalse);
      expect(item.canRetry, isTrue);
    });
  });
}
