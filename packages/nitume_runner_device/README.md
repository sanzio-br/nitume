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
| `OneTimeFlag` | `SharedPreferencesOneTimeFlag` (job-start location notice, row 246) | shared_preferences |
| `DirectoryEvidenceFileStore` | `appSupportEvidenceFileStore()` (excluded from backups, row 255) | path_provider + own iOS code |

```dart
import 'package:nitume_core/nitume_core.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';
```

Platform permission strings, backup rules and the Android foreground-service
permissions belong in `apps/runner_app`.

## Native code (iOS only)

This package is a Flutter plugin with an iOS side only
(`ios/nitume_runner_device`, CocoaPods and Swift Package Manager; Apple
frameworks, no third-party code). `BackupExclusion.exclude` sets
`NSURLIsExcludedFromBackupKey` on the offline evidence folder through the
`nitume_runner_device/backup` method channel (owner row 255). Android has no
native side: the runner app's manifest backup rules exclude
`nitume_evidence` (`file` domain).

## Location (owner row 245)

While-in-use permission only. `GeolocatorPositionSource.requestAccess` is the
single when-in-use prompt; geolocator adds an "Allow all the time" / Always
request whenever the app declares `ACCESS_BACKGROUND_LOCATION` or an iOS
Always usage key, so the runner app must declare neither. During a job the
stream runs through geolocator's location foreground service (Android,
persistent notification `Nitume Runner` / `Sharing your location for your
active job.`) or iOS background updates (`UIBackgroundModes` `location`),
started only in the foreground by `LocationPinger`.
