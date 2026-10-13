import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show Uint8List, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../config/app_config.dart';
import '../models/errand_location.dart';
import '../theme/nitume_colors.dart';

/// C-31 map body on Google Maps (`google_maps_flutter`, BOARD row 30), for
/// `LiveTrackingMap(mapBuilder:)`. Drawn as `v-track` specifies:
///
/// * [start] pin blue (runner start / pickup), [end] pin green (task site /
///   drop-off): the mockup's 14px `.pin` teardrops.
/// * [runner] dot: 16px green with a 3px white ring, animated from the last
///   position to each new one ([moveDuration]); never shown when `null`
///   (the screen passes `null` outside the assignment window, rows 27, 65).
/// * A dashed blue line (8 on, 6 off) from [start] (or the runner when there
///   is no start) to [end]. It is a straight line, not a road route: a road
///   route needs the paid Directions API, which is not approved.
/// * Gestures on; no map-type, my-location, zoom, compass or toolbar
///   controls. The camera fits the points with 40 padding and refits when
///   the runner leaves the visible area.
///
/// Runner "self" variant (C-31 change for the runner app, R-16): pass the
/// device position as [runner] and the next point as [routeTo]; the dashed
/// line then runs from the device to [routeTo] instead of [start] → [end].
///
/// The mockup's runner-dot shadow is off-palette and not drawn (OA-14).
/// Use [GoogleTrackingMap.builderFor] so builds without a maps key keep the
/// placeholder.
class GoogleTrackingMap extends StatefulWidget {
  const GoogleTrackingMap({
    super.key,
    this.start,
    this.end,
    this.runner,
    this.routeTo,
    this.moveDuration = const Duration(milliseconds: 1200),
    this.fitPadding = 40,
  });

  final GeoPoint? start;
  final GeoPoint? end;
  final GeoPoint? runner;

  /// Self variant: draw the route from [runner] to this point. `null`
  /// keeps the customer route ([start] or [runner] → [end]).
  final GeoPoint? routeTo;

  /// How long the runner dot glides to a new position.
  final Duration moveDuration;

  /// Camera padding around the points, in logical pixels.
  final double fitPadding;

  /// A `LiveTrackingMap.mapBuilder` that shows this map, or `null` when
  /// [AppConfig.mapsEnabled] is false (no maps key in the build), so
  /// `LiveTrackingMap` keeps its placeholder.
  static WidgetBuilder? builderFor(
    AppConfig config, {
    GeoPoint? start,
    GeoPoint? end,
    GeoPoint? runner,
    GeoPoint? routeTo,
  }) {
    if (!config.mapsEnabled) return null;
    return (_) => GoogleTrackingMap(
      start: start,
      end: end,
      runner: runner,
      routeTo: routeTo,
    );
  }

  @override
  State<GoogleTrackingMap> createState() => _GoogleTrackingMapState();
}

class _GoogleTrackingMapState extends State<GoogleTrackingMap>
    with SingleTickerProviderStateMixin {
  static const _startId = MarkerId('start');
  static const _endId = MarkerId('end');
  static const _runnerId = MarkerId('runner');

  GoogleMapController? _controller;
  TrackingMarkerIcons? _icons;
  late final AnimationController _move = AnimationController(
    vsync: this,
    duration: widget.moveDuration,
  )..addListener(_onMoveTick);

  GeoPoint? _from;
  GeoPoint? _shown;
  bool _fittedOnce = false;
  double? _iconsForRatio;

  @override
  void initState() {
    super.initState();
    _shown = widget.runner;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final ratio = MediaQuery.devicePixelRatioOf(context);
    if (_iconsForRatio != ratio) {
      _iconsForRatio = ratio;
      TrackingMarkerIcons.create(ratio).then((icons) {
        if (mounted) setState(() => _icons = icons);
      });
    }
  }

  @override
  void didUpdateWidget(GoogleTrackingMap old) {
    super.didUpdateWidget(old);
    final next = widget.runner;
    if (next == null) {
      // Outside the window: remove at once, keep nothing (row 27).
      _move.stop();
      _from = null;
      _shown = null;
    } else if (_shown == null) {
      _shown = next;
      _fitIfNeeded(force: !_fittedOnce);
    } else if (next != old.runner) {
      _from = _shown;
      _move.forward(from: 0);
    }
    if (widget.start != old.start || widget.end != old.end) {
      _fitIfNeeded(force: true);
    }
  }

  void _onMoveTick() {
    final from = _from;
    final to = widget.runner;
    if (from == null || to == null) return;
    setState(() => _shown = lerpGeoPoint(from, to, _move.value));
    if (_move.isCompleted) _fitIfNeeded();
  }

  Future<void> _fitIfNeeded({bool force = false}) async {
    final c = _controller;
    if (c == null) return;
    final runner = _shown;
    if (!force && runner != null) {
      final visible = await c.getVisibleRegion();
      if (visible.contains(LatLng(runner.lat, runner.lng))) return;
    }
    final points = [widget.start, widget.end, runner].whereType<GeoPoint>();
    final update = cameraFor(points, padding: widget.fitPadding);
    if (update == null || !mounted) return;
    _fittedOnce = true;
    await c.animateCamera(update);
  }

  @override
  void dispose() {
    _move.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icons = _icons;
    final start = widget.start;
    final end = widget.end;
    final runner = _shown;
    final markers = <Marker>{
      if (icons != null && start != null)
        Marker(
          markerId: _startId,
          position: LatLng(start.lat, start.lng),
          icon: icons.start,
          anchor: const Offset(0.5, 1),
          consumeTapEvents: true,
        ),
      if (icons != null && end != null)
        Marker(
          markerId: _endId,
          position: LatLng(end.lat, end.lng),
          icon: icons.end,
          anchor: const Offset(0.5, 1),
          consumeTapEvents: true,
        ),
      if (icons != null && runner != null)
        Marker(
          markerId: _runnerId,
          position: LatLng(runner.lat, runner.lng),
          icon: icons.runner,
          anchor: const Offset(0.5, 0.5),
          zIndexInt: 2,
          consumeTapEvents: true,
        ),
    };
    final route = routeFor(
      start: start,
      end: end,
      runner: runner,
      routeTo: widget.routeTo,
    );
    final initial = [start, end, runner].whereType<GeoPoint>().firstOrNull;
    return ColoredBox(
      color: NitumeColors.blue050,
      child: GoogleMap(
        initialCameraPosition: CameraPosition(
          target: initial == null
              ? const LatLng(-1.2864, 36.8172)
              : LatLng(initial.lat, initial.lng),
          zoom: 14,
        ),
        onMapCreated: (c) {
          _controller = c;
          _fitIfNeeded(force: true);
        },
        markers: markers,
        polylines: {
          if (route != null)
            Polyline(
              polylineId: const PolylineId('route'),
              points: [
                LatLng(route.from.lat, route.from.lng),
                LatLng(route.to.lat, route.to.lng),
              ],
              color: NitumeColors.blue,
              width: 3,
              patterns: [PatternItem.dash(8), PatternItem.gap(6)],
            ),
        },
        mapType: MapType.normal,
        myLocationEnabled: false,
        myLocationButtonEnabled: false,
        zoomControlsEnabled: false,
        mapToolbarEnabled: false,
        compassEnabled: false,
        indoorViewEnabled: false,
        trafficEnabled: false,
        buildingsEnabled: false,
      ),
    );
  }
}

/// The dashed route segment: [runner] → [routeTo] in the self variant,
/// otherwise ([start] or [runner]) → [end]; `null` when a point is missing.
@visibleForTesting
({GeoPoint from, GeoPoint to})? routeFor({
  GeoPoint? start,
  GeoPoint? end,
  GeoPoint? runner,
  GeoPoint? routeTo,
}) {
  if (routeTo != null) {
    return runner == null ? null : (from: runner, to: routeTo);
  }
  final from = start ?? runner;
  if (from == null || end == null) return null;
  return (from: from, to: end);
}

/// Linear interpolation between two points (`t` in 0..1).
@visibleForTesting
GeoPoint lerpGeoPoint(GeoPoint a, GeoPoint b, double t) => GeoPoint(
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
);

/// Camera that shows every point: bounds with [padding], or a street-level
/// zoom on a single point; `null` for none.
@visibleForTesting
CameraUpdate? cameraFor(Iterable<GeoPoint> points, {double padding = 40}) {
  final list = points.toList();
  if (list.isEmpty) return null;
  final bounds = boundsFor(list)!;
  if (bounds.southwest == bounds.northeast) {
    return CameraUpdate.newLatLngZoom(bounds.southwest, 15);
  }
  return CameraUpdate.newLatLngBounds(bounds, padding);
}

/// Smallest bounds holding [points]; `null` for none.
@visibleForTesting
LatLngBounds? boundsFor(List<GeoPoint> points) {
  if (points.isEmpty) return null;
  var s = points.first.lat, n = s, w = points.first.lng, e = w;
  for (final p in points.skip(1)) {
    s = math.min(s, p.lat);
    n = math.max(n, p.lat);
    w = math.min(w, p.lng);
    e = math.max(e, p.lng);
  }
  return LatLngBounds(southwest: LatLng(s, w), northeast: LatLng(n, e));
}

/// The three marker bitmaps, drawn once per device pixel ratio.
class TrackingMarkerIcons {
  const TrackingMarkerIcons({
    required this.start,
    required this.end,
    required this.runner,
  });

  final BitmapDescriptor start;
  final BitmapDescriptor end;
  final BitmapDescriptor runner;

  static final _cache = <double, Future<TrackingMarkerIcons>>{};

  static Future<TrackingMarkerIcons> create(double pixelRatio) =>
      _cache[pixelRatio] ??= () async {
        final start = await drawPin(NitumeColors.blue, pixelRatio);
        final end = await drawPin(NitumeColors.green, pixelRatio);
        final runner = await drawRunnerDot(pixelRatio);
        return TrackingMarkerIcons(
          start: BitmapDescriptor.bytes(start, imagePixelRatio: pixelRatio),
          end: BitmapDescriptor.bytes(end, imagePixelRatio: pixelRatio),
          runner: BitmapDescriptor.bytes(runner, imagePixelRatio: pixelRatio),
        );
      }();

  /// Mockup `.pin`: a 14px square with three round corners, turned -45° so
  /// the sharp corner points down (PNG; tip at bottom centre).
  @visibleForTesting
  static Future<Uint8List> drawPin(Color color, double pixelRatio) {
    const side = 14.0;
    final box = side * math.sqrt2;
    return _draw(box, box, pixelRatio, (canvas) {
      canvas
        ..translate(box / 2, box / 2)
        ..rotate(-math.pi / 4);
      const r = Radius.circular(side / 2);
      canvas.drawRRect(
        RRect.fromRectAndCorners(
          const Rect.fromLTWH(-side / 2, -side / 2, side, side),
          topLeft: r,
          topRight: r,
          bottomRight: r,
        ),
        Paint()..color = color,
      );
    });
  }

  /// Mockup `.runner-dot`: 16px, green with a 3px white ring (PNG).
  @visibleForTesting
  static Future<Uint8List> drawRunnerDot(double pixelRatio) =>
      _draw(16, 16, pixelRatio, (canvas) {
        const c = Offset(8, 8);
        canvas
          ..drawCircle(c, 8, Paint()..color = NitumeColors.white)
          ..drawCircle(c, 5, Paint()..color = NitumeColors.green);
      });

  static Future<Uint8List> _draw(
    double width,
    double height,
    double pixelRatio,
    void Function(Canvas) paint,
  ) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)..scale(pixelRatio);
    paint(canvas);
    final picture = recorder.endRecording();
    final image = await picture.toImage(
      (width * pixelRatio).ceil(),
      (height * pixelRatio).ceil(),
    );
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    picture.dispose();
    image.dispose();
    return bytes!.buffer.asUint8List();
  }
}
