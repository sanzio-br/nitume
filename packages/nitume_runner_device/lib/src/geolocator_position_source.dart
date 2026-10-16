import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:nitume_core/nitume_core.dart';

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

  @visibleForTesting
  static LocationAccess mapPermission(LocationPermission p) => switch (p) {
    LocationPermission.denied => LocationAccess.denied,
    LocationPermission.deniedForever => LocationAccess.deniedForever,
    LocationPermission.whileInUse => LocationAccess.whileInUse,
    LocationPermission.always => LocationAccess.always,
    LocationPermission.unableToDetermine => LocationAccess.denied,
  };

  @visibleForTesting
  static DevicePosition fromPosition(Position p) => DevicePosition(
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
    return mapPermission(await Geolocator.checkPermission());
  }

  @override
  Future<LocationAccess> requestAccess() async {
    final now = await access();
    if (now != LocationAccess.denied) return now;
    return mapPermission(await Geolocator.requestPermission());
  }

  @override
  Future<DevicePosition?> current() async {
    final a = await access();
    if (a != LocationAccess.whileInUse && a != LocationAccess.always) {
      return null;
    }
    try {
      return fromPosition(await Geolocator.getCurrentPosition());
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
    return Geolocator.getPositionStream(locationSettings: settings)
        .map(fromPosition);
  }
}
