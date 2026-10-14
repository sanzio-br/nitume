# nitume_runner_device

Plugin-backed implementations of the device abstractions defined in
`nitume_core`, for the **runner app only** (owner row 124). Keeping them here
means the customer app never links geolocator, image_picker or
permission_handler.

| Core abstraction | Implementation here | Plugin |
|---|---|---|
| `PositionSource` | `GeolocatorPositionSource` | geolocator |
| `ImageCaptureSource` | `ImagePickerCaptureSource` | image_picker |
| `DevicePermissions` | `PermissionHandlerDevicePermissions` | permission_handler |
| `QueueStore` | `SharedPreferencesQueueStore` | shared_preferences |

```dart
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';
```

Platform permission strings and the Android foreground-service declaration
belong in `apps/runner_app`.
