import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

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

  /// Straight-line distance to [other] in metres.
  double distanceTo(DevicePosition other) =>
      Geolocator.distanceBetween(lat, lng, other.lat, other.lng);
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

/// Source of device positions. The default is [GeolocatorPositionSource];
/// tests inject a fake. Apps never import `geolocator` directly.
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

/// [PositionSource] on `geolocator` (owner row 124).
class GeolocatorPositionSource implements PositionSource {
  const GeolocatorPositionSource({
    this.notificationTitle = 'Nitume Runner',
    this.notificationText = 'Sharing your location for your active job.',
  });

  /// Android foreground-service notification shown while [positions] runs
  /// with `background: true`.
  final String notificationTitle;
  final String notificationText;

  static LocationAccess _map(LocationPermission p) => switch (p) {
    LocationPermission.denied => LocationAccess.denied,
    LocationPermission.deniedForever => LocationAccess.deniedForever,
    LocationPermission.whileInUse => LocationAccess.whileInUse,
    LocationPermission.always => LocationAccess.always,
    LocationPermission.unableToDetermine => LocationAccess.denied,
  };

  static DevicePosition _from(Position p) => DevicePosition(
    lat: p.latitude,
    lng: p.longitude,
    accuracy: p.accuracy,
    timestamp: p.timestamp.toUtc(),
  );

  @override
  Future<LocationAccess> access() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationAccess.serviceDisabled;
    }
    return _map(await Geolocator.checkPermission());
  }

  @override
  Future<LocationAccess> requestAccess() async {
    final now = await access();
    if (now != LocationAccess.denied) return now;
    return _map(await Geolocator.requestPermission());
  }

  @override
  Future<DevicePosition?> current() async {
    final a = await access();
    if (a != LocationAccess.whileInUse && a != LocationAccess.always) {
      return null;
    }
    try {
      return _from(await Geolocator.getCurrentPosition());
    } on Exception {
      return null;
    }
  }

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) {
    final distance = distanceFilterMeters.round();
    final LocationSettings settings = switch (defaultTargetPlatform) {
      TargetPlatform.android => AndroidSettings(
        distanceFilter: distance,
        intervalDuration: interval,
        foregroundNotificationConfig: background
            ? ForegroundNotificationConfig(
                notificationTitle: notificationTitle,
                notificationText: notificationText,
              )
            : null,
      ),
      TargetPlatform.iOS || TargetPlatform.macOS => AppleSettings(
        distanceFilter: distance,
        allowBackgroundLocationUpdates: background,
        showBackgroundLocationIndicator: background,
        pauseLocationUpdatesAutomatically: !background,
      ),
      _ => LocationSettings(distanceFilter: distance),
    };
    return Geolocator.getPositionStream(locationSettings: settings).map(_from);
  }
}
