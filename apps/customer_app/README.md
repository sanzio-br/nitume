# Nitume customer app

Flutter app for Nitume customers. Shared theme, widgets, models, API client
and the SDK integrations live in `packages/nitume_core`.

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
`--dart-define=NITUME_API_BASE_URL=http://10.0.2.2:3000/api/v1`.

Debug Android builds allow cleartext HTTP to `10.0.2.2` / `localhost` only
(`android/app/src/debug/res/xml/network_security_config.xml`); release builds
are HTTPS-only.

## Build configuration

Every integration is optional: without its configuration the app builds and
runs with that feature off. **Never commit real keys or Firebase files.**

| Setting | Where | Without it |
|---|---|---|
| `NITUME_PLACES_API_KEY` | `--dart-define` | Place search falls back to saved addresses with coordinates (notice on the wizard and address form) |
| `NITUME_MAPS_ENABLED=true` + Maps SDK key | `.env` / `--dart-define` + platform key (below) | Track keeps the map placeholder |
| `NITUME_TERMS_URL`, `NITUME_PRIVACY_URL`, `NITUME_SUPPORT_URI` | `--dart-define` | Legal links render as plain text; the Support row is hidden |
| `NITUME_QUOTE_PREVIEW=true` | `--dart-define` | The wizard shows no price (row 47, default) |
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

Restrict each key to the app (Android package + SHA-1 / iOS bundle id).

### Firebase Cloud Messaging (row 31)

- **Android**: put `google-services.json` in `android/app/` (gitignored). The
  Google Services Gradle plugin is applied only when that file exists.
- **iOS**: add `GoogleService-Info.plist` to the Runner target in Xcode (the
  file is gitignored), upload the APNs key in the Firebase console, and keep
  the Push Notifications capability (`Runner/Runner.entitlements`; switch
  `aps-environment` to `production` for App Store builds). Background mode
  `remote-notification` is enabled in `Info.plist`.

Without these files `FcmPushService.initialize()` returns a no-op service.

### External links (row 39)

`url_launcher` opens Terms, Privacy and Support. Android declares the
`https`, `tel` and `mailto` intents under `<queries>`; iOS lists them in
`LSApplicationQueriesSchemes`.

## Checks

```sh
flutter analyze
flutter test
```
