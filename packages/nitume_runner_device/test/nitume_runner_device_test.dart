import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _FakePicker extends ImagePickerPlatform with MockPlatformInterfaceMixin {
  ImageSource? source;
  ImagePickerOptions? options;
  XFile? result = XFile('/tmp/cap.jpg', mimeType: 'image/jpeg');

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    this.source = source;
    this.options = options;
    return result;
  }

  LostDataResponse lost = LostDataResponse.empty();

  @override
  Future<LostDataResponse> getLostData() async => lost;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GeolocatorPositionSource', () {
    test('Android job stream: location foreground service, ongoing '
        'notification with the final copy (row 245)', () {
      const src = GeolocatorPositionSource();
      final s =
          src.settingsFor(
                TargetPlatform.android,
                interval: const Duration(seconds: 4),
                distanceFilter: 15,
                background: true,
              )
              as AndroidSettings;
      final n = s.foregroundNotificationConfig!;
      expect(n.notificationTitle, 'Nitume Runner');
      expect(n.notificationText, 'Sharing your location for your active job.');
      expect(n.setOngoing, isTrue);
      expect(s.distanceFilter, 15);
      expect(s.intervalDuration, const Duration(seconds: 4));

      final idle =
          src.settingsFor(
                TargetPlatform.android,
                interval: const Duration(seconds: 30),
                distanceFilter: 0,
                background: false,
              )
              as AndroidSettings;
      expect(idle.foregroundNotificationConfig, isNull);
    });

    test('iOS job stream: background updates with the indicator', () {
      const src = GeolocatorPositionSource();
      final s =
          src.settingsFor(
                TargetPlatform.iOS,
                interval: const Duration(seconds: 4),
                distanceFilter: 15,
                background: true,
              )
              as AppleSettings;
      expect(s.allowBackgroundLocationUpdates, isTrue);
      expect(s.showBackgroundLocationIndicator, isTrue);
      expect(s.pauseLocationUpdatesAutomatically, isFalse);
      final fg =
          src.settingsFor(
                TargetPlatform.iOS,
                interval: const Duration(seconds: 4),
                distanceFilter: 15,
                background: false,
              )
              as AppleSettings;
      expect(fg.allowBackgroundLocationUpdates, isFalse);
    });

    test('maps permissions', () {
      expect(
        GeolocatorPositionSource.mapPermission(LocationPermission.whileInUse),
        LocationAccess.whileInUse,
      );
      expect(
        GeolocatorPositionSource.mapPermission(LocationPermission.always),
        LocationAccess.always,
      );
      expect(
        GeolocatorPositionSource.mapPermission(
          LocationPermission.deniedForever,
        ),
        LocationAccess.deniedForever,
      );
      expect(
        GeolocatorPositionSource.mapPermission(
          LocationPermission.unableToDetermine,
        ),
        LocationAccess.denied,
      );
    });

    test('converts a fix to a UTC DevicePosition', () {
      final p = GeolocatorPositionSource.fromPosition(
        Position(
          latitude: -4.03,
          longitude: 39.71,
          timestamp: DateTime.utc(2026, 10, 13, 7, 31),
          accuracy: 8,
          altitude: 0,
          altitudeAccuracy: 0,
          heading: 0,
          headingAccuracy: 0,
          speed: 0,
          speedAccuracy: 0,
        ),
      );
      expect((p.lat, p.lng, p.accuracy), (-4.03, 39.71, 8.0));
      expect(p.timestamp.isUtc, isTrue);
    });
  });

  group('ImagePickerCaptureSource', () {
    late _FakePicker fake;
    setUp(() => ImagePickerPlatform.instance = fake = _FakePicker());

    test('camera, long edge 1600, JPEG 80, no metadata', () async {
      final img = await ImagePickerCaptureSource().takePhoto();
      expect(img!.path, '/tmp/cap.jpg');
      expect(img.contentType, 'image/jpeg');
      expect(fake.source, ImageSource.camera);
      final o = fake.options!;
      expect((o.maxWidth, o.maxHeight, o.imageQuality), (1600.0, 1600.0, 80));
      expect(o.requestFullMetadata, isFalse);
    });

    test('front camera: camera source, front lens, still compressed', () async {
      await ImagePickerCaptureSource().takePhoto(from: CaptureFrom.frontCamera);
      expect(fake.source, ImageSource.camera);
      final o = fake.options!;
      expect(o.preferredCameraDevice, CameraDevice.front);
      expect((o.maxWidth, o.imageQuality), (1600.0, 80));
    });

    test('rear lens by default', () async {
      await ImagePickerCaptureSource().takePhoto();
      expect(fake.options!.preferredCameraDevice, CameraDevice.rear);
      expect(CaptureFrom.camera.isCamera, isTrue);
      expect(CaptureFrom.frontCamera.isCamera, isTrue);
      expect(CaptureFrom.gallery.isCamera, isFalse);
    });

    test('gallery picks are not resized (B-1: no hidden full copy)', () async {
      await ImagePickerCaptureSource().takePhoto(from: CaptureFrom.gallery);
      expect(fake.source, ImageSource.gallery);
      final o = fake.options!;
      expect((o.maxWidth, o.maxHeight, o.imageQuality), (null, null, null));
    });

    test('discard removes the gallery copy and its uuid directory', () async {
      final cache = await Directory.systemTemp.createTemp('nitume_cache');
      addTearDown(() => cache.delete(recursive: true));
      final dir = Directory(
        '${cache.path}/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
      )..createSync();
      final copy = File('${dir.path}/id.png')
        ..writeAsBytesSync([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      fake.result = XFile(copy.path, mimeType: 'image/jpeg');
      final img = (await ImagePickerCaptureSource().takePhoto(
        from: CaptureFrom.gallery,
      ))!;
      expect(img.scratchDirectory, dir.path);
      expect(img.contentType, 'image/png', reason: 'bytes beat mimeType');
      await img.discard();
      await img.discard();
      expect(copy.existsSync(), isFalse);
      expect(dir.existsSync(), isFalse);
      expect(cache.listSync(), isEmpty);
    });

    test('a camera file outside a uuid directory has no scratch dir', () {
      expect(
        ImagePickerCaptureSource.scratchDirectoryOf('/data/cache/scaled_x.jpg'),
        isNull,
      );
    });

    test('discardLostCaptures deletes kept photos on Android only', () async {
      final cache = await Directory.systemTemp.createTemp('nitume_lost');
      addTearDown(() => cache.delete(recursive: true));
      final kept = File('${cache.path}/scaled_cap.jpg')..writeAsBytesSync([1]);
      fake.lost = LostDataResponse(files: [XFile(kept.path)]);
      expect(
        await ImagePickerCaptureSource(isAndroid: false).discardLostCaptures(),
        0,
      );
      expect(kept.existsSync(), isTrue);
      expect(
        await ImagePickerCaptureSource(isAndroid: true).discardLostCaptures(),
        1,
      );
      expect(kept.existsSync(), isFalse);
    });

    test('content type: magic bytes, then mimeType, then extension', () async {
      const sniff = ImagePickerCaptureSource.sniffImageType;
      expect(sniff([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg');
      expect(
        sniff([...'RIFF'.codeUnits, 0, 0, 0, 0, ...'WEBP'.codeUnits]),
        'image/webp',
      );
      expect(sniff([0, 0, 0, 24, ...'ftypheic'.codeUnits]), 'image/heic');
      expect(sniff([0, 0, 0, 24, ...'ftypmif1'.codeUnits]), 'image/heif');
      expect(sniff([1, 2, 3]), isNull);
      final of = ImagePickerCaptureSource.contentTypeOf;
      expect(await of(XFile('/nope/a.webp')), 'image/webp');
      expect(await of(XFile('/nope/a', mimeType: 'image/png')), 'image/png');
      expect(await of(XFile('/nope/a')), 'image/jpeg');
    });

    test('gallery on request; cancel returns null', () async {
      fake.result = null;
      final img = await ImagePickerCaptureSource().takePhoto(
        from: CaptureFrom.gallery,
      );
      expect(img, isNull);
      expect(fake.source, ImageSource.gallery);
    });
  });

  test('PermissionHandlerDevicePermissions maps statuses', () {
    const m = PermissionHandlerDevicePermissions.mapStatus;
    expect(m(PermissionStatus.granted), CameraAccess.granted);
    expect(m(PermissionStatus.limited), CameraAccess.granted);
    expect(m(PermissionStatus.denied), CameraAccess.denied);
    expect(m(PermissionStatus.permanentlyDenied), CameraAccess.deniedForever);
    expect(m(PermissionStatus.restricted), CameraAccess.deniedForever);
  });

  test('SharedPreferencesQueueStore round-trips through the queue', () async {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    final store = SharedPreferencesQueueStore();
    expect(await store.read(), isEmpty);
    final q = OfflineActionQueue(
      store: store,
      runner: (_) async => ReplayOutcome.retryLater,
      newId: () => 'k1',
    );
    await q.enqueue(
      QueuedActionKind.runnerNotes,
      errandId: 'e1',
      payload: RunnerQueuedActions.runnerNotes('Gate locked'),
    );
    final restored = OfflineActionQueue(
      store: SharedPreferencesQueueStore(),
      runner: (_) async => ReplayOutcome.done,
    );
    await restored.load();
    expect(restored.pending.single.id, 'k1');
    expect(restored.pending.single.payload['runnerNotes'], 'Gate locked');
  });
}
