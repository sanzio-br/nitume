import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

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

/// Photo capture. Photos only: no video for runners (row 121). The default
/// is [ImagePickerCaptureSource]; tests inject a fake. Apps never import
/// `image_picker` directly.
abstract interface class ImageCaptureSource {
  /// `null` when the user cancels.
  Future<CapturedImage?> takePhoto({CaptureFrom from = CaptureFrom.camera});
}

/// [ImageCaptureSource] on `image_picker` (owner row 124), compressing on
/// capture: long edge ≤ [maxEdge] px, JPEG quality [quality] (`_shared.md`
/// R-22: 1600 px, 80).
class ImagePickerCaptureSource implements ImageCaptureSource {
  ImagePickerCaptureSource({
    ImagePicker? picker,
    this.maxEdge = 1600,
    this.quality = 80,
  }) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;
  final double maxEdge;
  final int quality;

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    final file = await _picker.pickImage(
      source: from == CaptureFrom.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: maxEdge,
      maxHeight: maxEdge,
      imageQuality: quality,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    return CapturedImage(
      path: file.path,
      contentType: file.mimeType ?? 'image/jpeg',
    );
  }
}

/// Camera permission as the screens need it.
enum CameraAccess { granted, denied, deniedForever }

/// Device permission checks and the system-settings shortcut
/// (`Camera access is off` + `Open Settings`). The default is
/// [PermissionHandlerDevicePermissions]; apps never import
/// `permission_handler` directly.
abstract interface class DevicePermissions {
  Future<CameraAccess> camera();
  Future<CameraAccess> requestCamera();

  /// Opens this app's page in the system settings; `false` when it could
  /// not be opened.
  Future<bool> openSettings();
}

/// [DevicePermissions] on `permission_handler` (owner row 124).
class PermissionHandlerDevicePermissions implements DevicePermissions {
  const PermissionHandlerDevicePermissions();

  static CameraAccess _map(PermissionStatus s) => switch (s) {
    PermissionStatus.granted ||
    PermissionStatus.limited => CameraAccess.granted,
    PermissionStatus.permanentlyDenied ||
    PermissionStatus.restricted => CameraAccess.deniedForever,
    _ => CameraAccess.denied,
  };

  @override
  Future<CameraAccess> camera() async => _map(await Permission.camera.status);

  @override
  Future<CameraAccess> requestCamera() async =>
      _map(await Permission.camera.request());

  @override
  Future<bool> openSettings() => openAppSettings();
}
