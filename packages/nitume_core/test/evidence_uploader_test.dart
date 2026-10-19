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

/// A store whose keep always fails (e.g. storage full).
class _FailingStore implements EvidenceFileStore {
  final discarded = <String>[];

  @override
  Future<String> keep(String sourcePath) async =>
      throw FileSystemException('full', sourcePath);

  @override
  Future<void> discard(String path) async => discarded.add(path);
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

  test('keep fails: the picker file is the kept path and is not discarded '
      'before upload', () async {
    final store = _FailingStore();
    final u = EvidenceUploader(
      capture: camera,
      upload: upload,
      files: store,
      clock: () => now,
    );
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(camera.discarded, isEmpty);
    expect(item!.path, startsWith(cache.path));
    expect(item.status, EvidenceUploadStatus.uploaded);
    expect(calls.single.bytes, 10);
    expect(store.discarded, [item.path], reason: 'released as a kept copy');
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
    Future<void> settle() => Future<void>.delayed(Duration.zero);

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
      await settle();
      expect(kept(), isEmpty);
    });

    test('disposed while uploading, then offline: the queue keeps the '
        'copy', () async {
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
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
      expect((await pending)!.status, EvidenceUploadStatus.queued);
      expect(queue.pending, hasLength(1));
      expect(kept(), hasLength(1));
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
}
