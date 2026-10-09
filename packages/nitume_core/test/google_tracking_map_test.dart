import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

const _a = GeoPoint(lat: -1.30, lng: 36.80);
const _b = GeoPoint(lat: -1.25, lng: 36.85);

void main() {
  test('builderFor is null without a maps key', () {
    expect(GoogleTrackingMap.builderFor(const AppConfig(), end: _a), isNull);
    expect(
      GoogleTrackingMap.builderFor(const AppConfig(mapsEnabled: true), end: _a),
      isNotNull,
    );
  });

  testWidgets('LiveTrackingMap without a builder shows the blue-050 fill', (
    tester,
  ) async {
    await pumpThemed(
      tester,
      LiveTrackingMap(
        mapBuilder: GoogleTrackingMap.builderFor(const AppConfig()),
        etaLabel: 'ETA 12 min',
      ),
    );
    final box = tester.widget<ColoredBox>(
      find.byKey(const ValueKey('map-placeholder')),
    );
    expect(box.color, NitumeColors.blue050);
    expect(find.text('ETA 12 min'), findsOneWidget);
  });

  test('boundsFor and cameraFor fit every point', () {
    final bounds = boundsFor(const [_a, _b, GeoPoint(lat: -1.28, lng: 36.9)])!;
    expect(bounds.southwest, const LatLng(-1.30, 36.80));
    expect(bounds.northeast, const LatLng(-1.25, 36.9));
    expect(boundsFor(const []), isNull);
    expect(cameraFor(const []), isNull);
    expect(
      cameraFor(const [_a]).toString(),
      CameraUpdate.newLatLngZoom(const LatLng(-1.30, 36.80), 15).toString(),
    );
    expect(
      cameraFor(const [_a, _b], padding: 40)!.toJson(),
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: const LatLng(-1.30, 36.80),
          northeast: const LatLng(-1.25, 36.85),
        ),
        40,
      ).toJson(),
    );
  });

  test('lerpGeoPoint moves the runner between pings', () {
    expect(lerpGeoPoint(_a, _b, 0), _a);
    expect(lerpGeoPoint(_a, _b, 1), _b);
    final mid = lerpGeoPoint(_a, _b, 0.5);
    expect(mid.lat, closeTo(-1.275, 1e-9));
    expect(mid.lng, closeTo(36.825, 1e-9));
  });

  testWidgets('marker bitmaps use the design colours at the device ratio', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final pin = await TrackingMarkerIcons.drawPin(NitumeColors.green, 2);
      final dot = await TrackingMarkerIcons.drawRunnerDot(2);
      final pinImage = await _decode(pin);
      final dotImage = await _decode(dot);
      // 14px pin turned 45°: ~19.8px box; runner dot 16px.
      expect(pinImage.width, 40);
      expect(dotImage.width, 32);
      expect(await _pixel(dotImage, 16, 16), NitumeColors.green);
      expect(await _pixel(dotImage, 16, 2), NitumeColors.white);
      expect(await _pixel(pinImage, 20, 20), NitumeColors.green);
      expect(await _pixel(pinImage, 1, 1), const Color(0x00000000));
    });
  });
}

Future<ui.Image> _decode(Uint8List png) async {
  final codec = await ui.instantiateImageCodec(png);
  return (await codec.getNextFrame()).image;
}

Future<Color> _pixel(ui.Image image, int x, int y) async {
  final data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  final i = (y * image.width + x) * 4;
  return Color.fromARGB(
    data.getUint8(i + 3),
    data.getUint8(i),
    data.getUint8(i + 1),
    data.getUint8(i + 2),
  );
}
