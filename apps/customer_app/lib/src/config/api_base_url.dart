/// API base URL (row 59), in order of precedence:
///   1. `--dart-define=NITUME_API_BASE_URL=...`, or the same key in a local
///      `.env` passed with `--dart-define-from-file=.env` (see README;
///      `.env` is gitignored and not bundled as an asset).
///   2. The default sandbox tunnel.
String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;
  return 'https://cargo-horizontal-traditional-wellington.trycloudflare.com/api/v1';
}
