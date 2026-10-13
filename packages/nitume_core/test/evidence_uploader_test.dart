import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Camera implements ImageCaptureSource {
  CapturedImage? next = const CapturedImage(path: '/tmp/a.jpg');
  final from = <CaptureFrom>[];

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    this.from.add(from);
    return next;
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

typedef _Call = ({
  String errandId,
  EvidenceType type,
  int bytes,
  DateTime? capturedAt,
  double? lat,
  double? lon,
});

void main() {
  final now = DateTime.utc(2026, 10, 13, 7, 31);
  Object? failWith;
  late List<_Call> calls;

  Future<Evidence> upload(
    String errandId, {
    required EvidenceType type,
    required Uint8List bytes,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
  }) async {
    calls.add((
      errandId: errandId,
      type: type,
      bytes: bytes.length,
      capturedAt: capturedAt,
      lat: lat,
      lon: lon,
    ));
    final f = failWith;
    if (f != null) throw f;
    return Evidence(id: 'ev${calls.length}', errandId: errandId, type: type);
  }

  setUp(() {
    calls = [];
    failWith = null;
  });

  EvidenceUploader make({OfflineActionQueue? queue, _Camera? camera}) =>
      EvidenceUploader(
        capture: camera ?? _Camera(),
        upload: upload,
        positions: _Fix(),
        queue: queue,
        readFile: (_) async => Uint8List(10),
        clock: () => now,
      );

  test('camera capture uploads with time and location', () async {
    final camera = _Camera();
    final u = make(camera: camera);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(camera.from, [CaptureFrom.camera]);
    expect(item!.status, EvidenceUploadStatus.uploaded);
    expect(item.captureState, CaptureState.uploaded);
    expect(item.evidence!.id, 'ev1');
    expect(calls.single.capturedAt, now);
    expect((calls.single.lat, calls.single.lon), (-4.03, 39.71));
    expect(u.allSettled, isTrue);
  });

  test('cancelled capture adds nothing', () async {
    final u = make(camera: _Camera()..next = null);
    expect(await u.captureAndUpload('e1', type: EvidenceType.photo), isNull);
    expect(u.items, isEmpty);
    expect(calls, isEmpty);
  });

  test('server failure marks failed; retry uploads again', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'bad', statusCode: 400);
    final item = await u.captureAndUpload('e1', type: EvidenceType.receipt);
    expect(item!.status, EvidenceUploadStatus.failed);
    expect(item.captureState, CaptureState.failed);
    expect(u.allSettled, isFalse);
    failWith = null;
    await u.retry(item);
    expect(item.status, EvidenceUploadStatus.uploaded);
    expect(calls.map((c) => c.type), [
      EvidenceType.receipt,
      EvidenceType.receipt,
    ]);
  });

  test('offline capture goes to the queue', () async {
    final queue = OfflineActionQueue(
      store: InMemoryQueueStore(),
      runner: (_) async => ReplayOutcome.done,
    );
    final u = make(queue: queue);
    failWith = const NitumeApiException(message: 'x', isNetworkError: true);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(item!.status, EvidenceUploadStatus.queued);
    expect(u.allSettled, isTrue);
    final queued = queue.pending.single;
    expect(queued.kind, QueuedActionKind.evidenceUpload);
    expect(queued.payload['path'], '/tmp/a.jpg');
    expect(queued.payload['capturedAt'], '2026-10-13T07:31:00.000Z');
  });

  test('offline without a queue is a plain failure', () async {
    final u = make();
    failWith = const NitumeApiException(message: 'x', isNetworkError: true);
    final item = await u.captureAndUpload('e1', type: EvidenceType.photo);
    expect(item!.status, EvidenceUploadStatus.failed);
  });
}
