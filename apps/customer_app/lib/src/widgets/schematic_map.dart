import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Non-SDK map body for [LiveTrackingMap] until `google_maps_flutter` is
/// approved (BOARD row 30): blue-050 fill (OA-14), errand pins placed by
/// projecting lat/lng into the box, and the runner dot.
///
/// Only the runner dot listens to [runner], so a `location:update` (or a
/// poll) animates the marker without rebuilding the map.
class SchematicMap extends StatelessWidget {
  const SchematicMap({super.key, required this.points, required this.runner});

  final List<ErrandLocation> points;
  final ValueListenable<GeoPoint?> runner;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: NitumeColors.blue050,
      child: LayoutBuilder(
        builder: (context, box) {
          final size = box.biggest;
          return ValueListenableBuilder<GeoPoint?>(
            valueListenable: runner,
            builder: (context, position, _) {
              final projection = _Projection.fit([
                for (final p in points) p.point,
                ?position,
              ], size);
              return Stack(
                children: [
                  for (final p in points)
                    _place(
                      projection.at(p.point),
                      _Pin(
                        color: p.pointType == ErrandPointType.pickup
                            ? NitumeColors.blue
                            : NitumeColors.green,
                      ),
                      const Size(24, 24),
                    ),
                  if (position != null)
                    AnimatedPositioned(
                      key: const ValueKey('runner-dot'),
                      duration: const Duration(milliseconds: 900),
                      curve: Curves.easeInOut,
                      left: projection.at(position).dx - 8,
                      top: projection.at(position).dy - 8,
                      child: const _RunnerDot(),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  static Widget _place(Offset at, Widget child, Size size) => Positioned(
    left: at.dx - size.width / 2,
    top: at.dy - size.height,
    width: size.width,
    height: size.height,
    child: child,
  );
}

class _Projection {
  _Projection(
    this._minLat,
    this._maxLat,
    this._minLng,
    this._maxLng,
    this._size,
  );

  factory _Projection.fit(List<GeoPoint> pts, Size size) {
    if (pts.isEmpty) return _Projection(-1, 1, -1, 1, size);
    var minLat = pts.first.lat, maxLat = pts.first.lat;
    var minLng = pts.first.lng, maxLng = pts.first.lng;
    for (final p in pts) {
      minLat = math.min(minLat, p.lat);
      maxLat = math.max(maxLat, p.lat);
      minLng = math.min(minLng, p.lng);
      maxLng = math.max(maxLng, p.lng);
    }
    const minSpan = 0.002;
    if (maxLat - minLat < minSpan) {
      minLat -= minSpan;
      maxLat += minSpan;
    }
    if (maxLng - minLng < minSpan) {
      minLng -= minSpan;
      maxLng += minSpan;
    }
    return _Projection(minLat, maxLat, minLng, maxLng, size);
  }

  final double _minLat, _maxLat, _minLng, _maxLng;
  final Size _size;
  static const _pad = 0.18;

  Offset at(GeoPoint p) {
    final x = (p.lng - _minLng) / (_maxLng - _minLng);
    final y = 1 - (p.lat - _minLat) / (_maxLat - _minLat);
    final w = _size.width * (1 - 2 * _pad);
    final h = _size.height * (1 - 2 * _pad);
    return Offset(_size.width * _pad + x * w, _size.height * _pad + y * h);
  }
}

class _Pin extends StatelessWidget {
  const _Pin({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      Icon(Icons.location_on_rounded, color: color, size: 24);
}

/// 16px green dot with a 3px white ring, no shadow (OA-14).
class _RunnerDot extends StatelessWidget {
  const _RunnerDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      // 16 overall: 10 green + the 3px white ring each side (v-track).
      width: 16,
      height: 16,
      decoration: BoxDecoration(
        color: NitumeColors.green,
        shape: BoxShape.circle,
        border: Border.all(color: NitumeColors.white, width: 3),
      ),
    );
  }
}
