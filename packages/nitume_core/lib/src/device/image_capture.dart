/// A captured, already compressed image on local storage.
class CapturedImage {
  const CapturedImage({required this.path, this.contentType = 'image/jpeg'});

  final String path;
  final String contentType;
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
