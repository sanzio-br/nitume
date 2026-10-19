import 'dart:io';

/// A captured image on local storage. Camera captures are compressed;
/// gallery picks may be the original bytes (check the size before upload).
///
/// The photo may show an ID or a face (restricted data, rows 125, 144):
/// read it, then call [discard] so no copy stays on the device.
class CapturedImage {
  const CapturedImage({
    required this.path,
    this.contentType = 'image/jpeg',
    this.scratchDirectory,
  });

  final String path;
  final String contentType;

  /// A directory the capture source created only for this capture (e.g.
  /// image_picker's `cacheDir/<uuid>/` copy of a gallery pick); [discard]
  /// deletes it with everything in it. `null` when there is none.
  final String? scratchDirectory;

  /// Deletes the file at [path] and the [scratchDirectory]. Safe to call
  /// more than once; missing files are ignored. After it completes no file
  /// of this capture is left on the device.
  Future<void> discard() async {
    await _delete(File(path));
    final dir = scratchDirectory;
    if (dir != null) await _delete(Directory(dir));
  }

  static Future<void> _delete(FileSystemEntity e) async {
    try {
      if (await e.exists()) await e.delete(recursive: true);
    } on FileSystemException {
      // Already gone (raced with another discard).
    }
  }
}

/// Where a capture comes from.
enum CaptureFrom {
  /// The camera (evidence: always, `v-evidence-capture`).
  camera,

  /// The gallery (onboarding only, and the accessibility path, §11).
  gallery,
}

/// Photo capture. Photos only: no video for runners (row 121). The runner
/// app uses `ImagePickerCaptureSource` from `package:nitume_runner_device`
/// (long edge 1600 px, JPEG 80); tests inject a fake. Apps never import
/// `image_picker` directly.
abstract interface class ImageCaptureSource {
  /// `null` when the user cancels.
  Future<CapturedImage?> takePhoto({CaptureFrom from = CaptureFrom.camera});
}

/// Camera permission as the screens need it.
enum CameraAccess { granted, denied, deniedForever }

/// Device permission checks and the system-settings shortcut
/// (`Camera access is off` + `Open Settings`). The runner app uses
/// `PermissionHandlerDevicePermissions` from `package:nitume_runner_device`;
/// apps never import `permission_handler` directly.
abstract interface class DevicePermissions {
  Future<CameraAccess> camera();
  Future<CameraAccess> requestCamera();

  /// Opens this app's page in the system settings; `false` when it could
  /// not be opened.
  Future<bool> openSettings();
}
