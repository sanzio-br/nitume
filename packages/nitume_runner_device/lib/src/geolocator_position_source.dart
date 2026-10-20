import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:nitume_core/nitume_core.dart';

/// [PositionSource] on `geolocator` (owner row 124).
///
/// While-in-use permission only (owner row 245): [requestAccess] shows the
/// single when-in-use prompt and never asks for "Allow all the time" /
/// Always. That holds only while the runner app declares no
/// `ACCESS_BACKGROUND_LOCATION` (Android) and no
/// `NSLocationAlwaysAndWhenInUseUsageDescription` /
/// `NSLocationAlwaysUsageDescription` (iOS): geolocator adds the background
/// request whenever those are present.
///
/// [positions] with `background: true` (the live job window, driven by
/// `LocationPinger`, which only starts it in the foreground):
/// * Android: geolocator's location foreground service (type `location`,
///   declared by the plugin) with the persistent, ongoing notification
///   [notificationTitle] / [notificationText] (`_shared.md` §10, final) on
///   the channel [notificationChannelName] (`_shared.md` §10, round 18).
///   It stops, and the notification goes, when the stream is cancelled (job
///   finished, runner offline).
/// * iOS: background location updates with the blue indicator; needs
///   `UIBackgroundModes` `location` in the app's Info.plist.
class GeolocatorPositionSource implements PositionSource {
  const GeolocatorPositionSource({
    this.notificationTitle = 'Nitume Runner',
    this.notificationText = 'Sharing your location for your active job.',
    this.notificationChannelName = 'Location during jobs',
  });

  /// Android foreground-service notification shown while [positions] runs
  /// with `background: true`.
  final String notificationTitle;
  final String notificationText;

  /// Android notification channel of that notification, listed under the
  /// app's notification settings. Replaces geolocator's default
  /// `Background Location`, which suggests background access the app does
  /// not ask for (`_shared.md` §10).
  final String notificationChannelName;

  /// The geolocator settings [positions] uses on [platform].
  @visibleForTesting
  LocationSettings settingsFor(
    TargetPlatform platform, {
    required Duration interval,
    required int distanceFilter,
    required bool background,
  }) => switch (platform) {
    TargetPlatform.android => AndroidSettings(
      distanceFilter: distanceFilter,
      intervalDuration: interval,
      foregroundNotificationConfig: background
          ? ForegroundNotificationConfig(
              notificationTitle: notificationTitle,
              notificationText: notificationText,
              notificationChannelName: notificationChannelName,
              setOngoing: true,
            )
          : null,
    ),
    TargetPlatform.iOS || TargetPlatform.macOS => AppleSettings(
      distanceFilter: distanceFilter,
      allowBackgroundLocationUpdates: background,
      showBackgroundLocationIndicator: background,
      pauseLocationUpdatesAutomatically: !background,
    ),
    _ => LocationSettings(distanceFilter: distanceFilter),
  };

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
    final settings = settingsFor(
      defaultTargetPlatform,
      interval: interval,
      distanceFilter: distanceFilterMeters.round(),
      background: background,
    );
    return Geolocator.getPositionStream(locationSettings: settings)
        .map(fromPosition);
  }
}
