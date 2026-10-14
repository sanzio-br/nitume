import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

/// One device fix. Coordinates in degrees, [accuracy] in metres,
/// [timestamp] in UTC.
@immutable
class DevicePosition {
  const DevicePosition({
    required this.lat,
    required this.lng,
    required this.timestamp,
    this.accuracy,
  });

  final double lat;
  final double lng;
  final double? accuracy;
  final DateTime timestamp;

  /// Straight-line (great-circle, haversine) distance to [other] in metres.
  double distanceTo(DevicePosition other) {
    const earthRadius = 6371000.0;
    double rad(double deg) => deg * math.pi / 180;
    final dLat = rad(other.lat - lat);
    final dLng = rad(other.lng - lng);
    final a =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(lat)) *
            math.cos(rad(other.lat)) *
            math.pow(math.sin(dLng / 2), 2);
    return 2 * earthRadius * math.asin(math.min(1, math.sqrt(a)));
  }
}

/// Location permission as the app needs to read it.
enum LocationAccess {
  /// Location services are off on the device.
  serviceDisabled,
  denied,

  /// Denied for good: only the system settings can change it.
  deniedForever,
  whileInUse,
  always,
}

/// Source of device positions. The runner app uses
/// `GeolocatorPositionSource` from `package:nitume_runner_device`; tests
/// inject a fake. Apps never import `geolocator` directly.
abstract interface class PositionSource {
  /// Current permission without prompting.
  Future<LocationAccess> access();

  /// Prompts for when-in-use permission when it can still be granted
  /// (show `x-location-disclosure` first).
  Future<LocationAccess> requestAccess();

  /// One fresh fix, or `null` without permission / a fix.
  Future<DevicePosition?> current();

  /// Continuous fixes filtered by [distanceFilterMeters] at roughly
  /// [interval]. [background] keeps updates running while the app is in the
  /// background (Android foreground service with a notification, iOS
  /// background location); only for the live job window (§7.2).
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  });
}
