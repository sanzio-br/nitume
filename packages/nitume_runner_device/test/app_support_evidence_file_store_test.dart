import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

class _FakePathProvider extends PathProviderPlatform
    with MockPlatformInterfaceMixin {
  _FakePathProvider(this.support);

  final String support;
  int asked = 0;

  @override
  Future<String?> getApplicationSupportPath() async {
    asked++;
    return support;
  }
}

/// image_picker writing a compressed capture into its cache folder.
class _Camera implements ImageCaptureSource {
  _Camera(this.cache);

  final Directory cache;
  int n = 0;

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    final f = File('${cache.path}/image_picker_${n++}.jpg')
      ..writeAsBytesSync([1, 2, 3]);
    return CapturedImage(path: f.path);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory support;
  late Directory cache;
  late _FakePathProvider paths;

  setUp(() {
    support = Directory.systemTemp.createTempSync('app_support');
    cache = Directory.systemTemp.createTempSync('picker_cache');
    paths = _FakePathProvider(support.path);
    PathProviderPlatform.instance = paths;
  });

  tearDown(() {
    support.deleteSync(recursive: true);
    cache.deleteSync(recursive: true);
  });

  List<FileSystemEntity> kept() {
    final d = Directory('${support.path}/nitume_evidence');
    return d.existsSync() ? d.listSync() : const [];
  }

  test('keeps copies in the app-support folder from path_provider', () async {
    final store = appSupportEvidenceFileStore();
    final src = File('${cache.path}/a.jpg')..writeAsStringSync('x');
    final path = await store.keep(src.path);
    expect(paths.asked, greaterThan(0));
    expect(path, startsWith('${support.path}/nitume_evidence/'));
    await store.discard(path);
    expect(kept(), isEmpty);
  });

  test('directory override', () async {
    final other = Directory.systemTemp.createTempSync('other');
    addTearDown(() => other.deleteSync(recursive: true));
    final store = appSupportEvidenceFileStore(directory: () async => other);
    final src = File('${cache.path}/a.jpg')..writeAsStringSync('x');
    expect(await store.keep(src.path), startsWith(other.path));
    expect(paths.asked, 0);
  });

  test('B-1 end to end: picker file discarded, queued offline in app '
      'storage, deleted on replay; log out and start-up clean-up', () async {
    final store = appSupportEvidenceFileStore();
    var offline = true;
    final queue = OfflineActionQueue(
      store: InMemoryQueueStore(),
      runner: (_) async => ReplayOutcome.done,
      onSettled: RunnerQueuedActions.cleanupFor(store),
    );
    final uploader = EvidenceUploader(
      capture: _Camera(cache),
      files: store,
      queue: queue,
      upload:
          (
            errandId, {
            required type,
            required Uint8List bytes,
            required contentType,
            capturedAt,
            lat,
            lon,
          }) async {
            if (offline) {
              throw const NitumeApiException(
                message: 'x',
                isNetworkError: true,
              );
            }
            return Evidence(id: 'ev', errandId: errandId, type: type);
          },
    );

    final item = await uploader.captureAndUpload(
      'e1',
      type: EvidenceType.photo,
    );
    expect(item!.status, EvidenceUploadStatus.queued);
    expect(item.keptInAppStorage, isTrue);
    expect(cache.listSync(), isEmpty, reason: 'picker file discarded');
    expect(kept(), hasLength(1));

    await queue.replay();
    expect(kept(), isEmpty, reason: 'deleted once the queue settles it');

    // Online upload: deleted at once.
    offline = false;
    await uploader.captureAndUpload('e1', type: EvidenceType.photo);
    expect(kept(), isEmpty);
    expect(cache.listSync(), isEmpty);

    // A killed app leaves copies: start-up keeps only what the queue holds.
    final src = File('${cache.path}/x.jpg')..writeAsStringSync('x');
    final queuedPath = await store.keep(src.path);
    await store.keep(src.path); // orphan
    await queue.enqueue(
      QueuedActionKind.evidenceUpload,
      errandId: 'e1',
      payload: RunnerQueuedActions.evidence(
        path: queuedPath,
        type: EvidenceType.photo,
        contentType: 'image/jpeg',
      ),
    );
    await store.discardExcept(RunnerQueuedActions.evidencePaths(queue.pending));
    expect(kept().map((f) => f.path), [queuedPath]);

    // Log out: clear the queue, then everything kept.
    await queue.clear();
    await store.discardAll();
    expect(kept(), isEmpty);
    uploader.dispose();
  });
}
