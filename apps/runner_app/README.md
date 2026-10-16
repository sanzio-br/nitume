# Nitume Runner app

Flutter app for Nitume runners. Shared theme, widgets, models, API client
and the SDK integrations live in `packages/nitume_core`. Screens are built
from `docs/specs/runner/*.md`.

## Run

```sh
cp .env.example .env          # local values; .env is gitignored
flutter pub get
flutter run --dart-define-from-file=.env
```

`.env` holds `--dart-define` values (`NITUME_API_BASE_URL`, keys and flags
below). It is read at build time through `--dart-define-from-file` and is
**not** bundled as an asset, so `flutter test` and builds work without it
(row 59). Single values can also be passed with
`--dart-define=NITUME_API_BASE_URL=http://10.0.2.2:3000/api/v1`. Without
any value the app uses `http://10.0.2.2:3000/api/v1` (the local API from the
Android emulator).

The app always signs in with `role: runner` (`POST /auth/otp/verify`); the
role is not a build setting.

Debug Android builds allow cleartext HTTP to `10.0.2.2` / `localhost` only
(`android/app/src/debug/res/xml/network_security_config.xml`); release builds
are HTTPS-only.

## App ids

| Platform | Id |
|---|---|
| Android `applicationId` | `com.nitume.runner_app` |
| iOS bundle id | `com.nitume.runnerApp` |

They differ from the customer app (`com.nitume.customer_app` /
`com.nitume.customerApp`), so both apps install side by side and each needs
its own Firebase app and Maps key restriction.

## Build configuration

Every integration is optional: without its configuration the app builds and
runs with that feature off. **Never commit real keys or Firebase files.**

| Setting | Where | Without it |
|---|---|---|
| `NITUME_MAPS_ENABLED=true` + Maps SDK key | `.env` / `--dart-define` + platform key (below) | Job maps keep the placeholder |
| `NITUME_TERMS_URL`, `NITUME_PRIVACY_URL`, `NITUME_SUPPORT_URI` | `--dart-define` | Legal links render as plain text; `Contact support` is hidden |
| Firebase config | platform files (below) | Push is off (no token registered) |

### Google Maps SDK key (row 30)

- **Android**: pass the key as the Gradle property or environment variable
  `MAPS_API_KEY`, or as `--dart-define=NITUME_MAPS_API_KEY=...`. It is
  injected into the manifest through `manifestPlaceholders`
  (`android/app/build.gradle.kts`).
- **iOS**: copy `ios/Flutter/Maps.xcconfig.example` to
  `ios/Flutter/Maps.xcconfig` (gitignored) and set `MAPS_API_KEY`.
  `AppDelegate.swift` calls `GMSServices.provideAPIKey` only when it is set.
- Also pass `--dart-define=NITUME_MAPS_ENABLED=true` so the app uses the map.

Restrict each key to the runner app (Android package + SHA-1 / iOS bundle
id above).

### Firebase Cloud Messaging (row 31)

- **Android**: put the runner app's `google-services.json` in `android/app/`
  (gitignored). The Google Services Gradle plugin is applied only when that
  file exists.
- **iOS**: add the runner app's `GoogleService-Info.plist` to the Runner
  target in Xcode (the file is gitignored), upload the APNs key in the
  Firebase console, and keep the Push Notifications capability
  (`Runner/Runner.entitlements`; switch `aps-environment` to `production` for
  App Store builds). Background mode `remote-notification` is enabled in
  `Info.plist`.

Without these files `FcmPushService.initialize()` returns a no-op service.

### External links (row 39)

`url_launcher` opens Terms, Privacy and Support. Android declares the
`https`, `tel` and `mailto` intents under `<queries>`; iOS lists them in
`LSApplicationQueriesSchemes`.

### Not configured yet

Location (when-in-use + background, Android 14 foreground-service type
`location`) and camera permission strings are added with the screens that
need them, once the packages are approved (RQ-12).

## Checks

```sh
flutter analyze
flutter test
```
