import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import '../navigation/nav.dart';
import 'app_services.dart';

/// Result of [ensureLocationPermission].
enum LocationGateResult {
  /// When-in-use (or always) is granted: go on.
  granted,

  /// `Not now` or the OS prompt was refused; it can be asked again.
  notNow,

  /// Denied for good or location services are off: only the system
  /// settings can change it (`Open Settings`).
  blocked,
}

/// Before going online or accepting an offer (`x-location-disclosure`
/// Entry): shows the disclosure before the first OS prompt, never prompts
/// without it.
Future<LocationGateResult> ensureLocationPermission(
  BuildContext context,
) async {
  final source = AppScope.read(context).location;
  final now = await source.access();
  switch (now) {
    case LocationAccess.whileInUse || LocationAccess.always:
      return LocationGateResult.granted;
    case LocationAccess.deniedForever || LocationAccess.serviceDisabled:
      return LocationGateResult.blocked;
    case LocationAccess.denied:
      break;
  }
  if (!context.mounted) return LocationGateResult.notNow;
  final after = await Nav.toLocationDisclosure(context);
  return switch (after) {
    LocationAccess.whileInUse ||
    LocationAccess.always => LocationGateResult.granted,
    LocationAccess.deniedForever ||
    LocationAccess.serviceDisabled => LocationGateResult.blocked,
    _ => LocationGateResult.notNow,
  };
}
