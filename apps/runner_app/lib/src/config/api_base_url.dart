/// API base URL (row 59), in order of precedence:
///   1. `--dart-define=NITUME_API_BASE_URL=...`, or the same key in a local
///      `.env` passed with `--dart-define-from-file=.env` (see README;
///      `.env` is gitignored and not bundled as an asset).
///   2. The local API as seen from the Android emulator.
String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;
  return 'http://10.0.2.2:3000/api/v1';
}
