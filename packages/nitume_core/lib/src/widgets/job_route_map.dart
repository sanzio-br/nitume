import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../models/errand_location.dart';
import 'google_tracking_map.dart';
import 'live_tracking_map.dart';

/// R-16. Runner job map (`.job-map`): a composition of C-31.
///
/// * [taskPoint] (task site, or the pickup) as the green pin.
/// * [dropoff] (second point, when the errand has one) as the blue pin.
/// * [self]: the runner's own device position (C-31 runner dot); `null`
///   without a device fix.
/// * A dashed route line from [self] to [routeTo] (the next point for the
///   job's state; defaults to [taskPoint]). Straight line, static: no live
///   ETA ticker and no ETA chip.
/// * [overlay]: usually a `NavigationChip` (R-06) inset 12 at the bottom.
///
/// Height 190, card radius. Builds without a maps key show the C-31
/// blue-050 placeholder body ([AppConfig.mapsEnabled] false). Decorative
/// for screen readers (`Map of the task location`): the address rows carry
/// the information.
class JobRouteMap extends StatelessWidget {
  const JobRouteMap({
    super.key,
    required this.config,
    this.taskPoint,
    this.dropoff,
    this.self,
    this.routeTo,
    this.overlay,
    this.height = 190,
  });

  final AppConfig config;
  final GeoPoint? taskPoint;
  final GeoPoint? dropoff;
  final GeoPoint? self;
  final GeoPoint? routeTo;
  final Widget? overlay;
  final double height;

  @override
  Widget build(BuildContext context) {
    // C-31 colours: `start` is the blue pin, `end` the green pin.
    return LiveTrackingMap(
      height: height,
      semanticLabel: 'Map of the task location',
      overlay: overlay,
      mapBuilder: GoogleTrackingMap.builderFor(
        config,
        start: dropoff,
        end: taskPoint,
        runner: self,
        routeTo: routeTo ?? taskPoint,
      ),
    );
  }
}
