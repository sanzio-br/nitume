import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

/// Base URL resolution.
///
/// The Android emulator cannot reach the host machine on `localhost`, so it is
/// mapped to `10.0.2.2`. Override for a physical device on the LAN with:
/// `--dart-define=NITUME_API_BASE_URL=http://192.168.x.x:3000/api/v1`
String resolveApiBaseUrl() {
  const override = String.fromEnvironment('NITUME_API_BASE_URL');
  if (override.isNotEmpty) return override;

  final isAndroid = defaultTargetPlatform == TargetPlatform.android;
  return isAndroid
      ? 'http://10.0.2.2:3000/api/v1'
      : 'http://localhost:3000/api/v1';
}