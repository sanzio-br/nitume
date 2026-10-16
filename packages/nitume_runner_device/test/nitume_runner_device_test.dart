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
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GeolocatorPositionSource', () {
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
