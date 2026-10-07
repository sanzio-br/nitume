import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Base URL resolution, resolved in order of precedence:
///   1. `--dart-define=NITUME_API_BASE_URL=...`
///   2. `NITUME_API_BASE_URL` in `.env`
///   3. The default sandbox tunnel.
String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;

  final fromEnv = dotenv.isInitialized
      ? dotenv.env['NITUME_API_BASE_URL']
      : null;
  if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;

  return 'https://cargo-horizontal-traditional-wellington.trycloudflare.com/api/v1';
}
