import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:permission_handler/permission_handler.dart';

/// [DevicePermissions] on `permission_handler` (owner row 124).
class PermissionHandlerDevicePermissions implements DevicePermissions {
  const PermissionHandlerDevicePermissions();

  @visibleForTesting
  static CameraAccess mapStatus(PermissionStatus s) => switch (s) {
    PermissionStatus.granted ||
    PermissionStatus.limited => CameraAccess.granted,
    PermissionStatus.permanentlyDenied ||
    PermissionStatus.restricted => CameraAccess.deniedForever,
    _ => CameraAccess.denied,
  };

  @override
  Future<CameraAccess> camera() async =>
      mapStatus(await Permission.camera.status);

  @override
  Future<CameraAccess> requestCamera() async =>
      mapStatus(await Permission.camera.request());

  @override
  Future<bool> openSettings() => openAppSettings();
}
