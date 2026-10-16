import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Camera implements ImageCaptureSource {
  _Camera(this.dir);

  final Directory dir;
  bool cancel = false;
  int n = 0;

  /// Simulates image_picker writing a compressed file to its cache.
  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    if (cancel) return null;
    final f = File('${dir.path}/picker_${n++}.jpg')
      ..writeAsBytesSync(List.filled(10, 7));
    return CapturedImage(path: f.path);
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

void main() {
  final now = DateTime.utc(2026, 10, 13, 7, 31);
  late Directory cache;
  late Directory app;
  late _Camera camera;
  late DirectoryEvidenceFileStore files;
  Object? failWith;
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
}
