import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

const _task = GeoPoint(lat: -4.03, lng: 39.71);
const _drop = GeoPoint(lat: -4.05, lng: 39.67);
const _me = GeoPoint(lat: -4.06, lng: 39.66);

void main() {
  group('C-31 self route (routeFor)', () {
    test('self variant runs from the device to routeTo', () {
      final r = routeFor(
        start: _drop,
        end: _task,
        runner: _me,
        routeTo: _drop,
      )!;
      expect((r.from, r.to), (_me, _drop));
    });

    test('no device fix: no self route', () {
      expect(routeFor(end: _task, routeTo: _task), isNull);
    });

    test('customer route is unchanged', () {
      final r = routeFor(start: _drop, end: _task, runner: _me)!;
      expect((r.from, r.to), (_drop, _task));
      final r2 = routeFor(end: _task, runner: _me)!;
      expect((r2.from, r2.to), (_me, _task));
    });
  });

  group('JobRouteMap (R-16)', () {
    testWidgets('placeholder without a maps key, nav chip overlay, 190 tall', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        Padding(
          padding: const EdgeInsets.all(20),
          child: JobRouteMap(
            config: const AppConfig(),
            taskPoint: _task,
            self: _me,
            overlay: NavigationChip(
              destination: 'Links Road, Nyali',
              detail: '1.2 km · 6 min',
              onNavigate: () {},
            ),
          ),
        ),
      );
      final box = tester.widget<ColoredBox>(
        find.byKey(const ValueKey('map-placeholder')),
      );
      expect(box.color, NitumeColors.blue050);
      expect(tester.getSize(find.byType(JobRouteMap)).height, 190);
      expect(find.byType(EtaChip), findsNothing);
      final map = tester.getRect(find.byType(JobRouteMap));
      final chip = tester.getRect(find.byType(NavigationChip));
      expect(map.bottom - chip.bottom, 12);
      expect(chip.left - map.left, 12);
      expect(find.bySemanticsLabel('Map of the task location'), findsOneWidget);
    });

    test('builderFor passes routeTo through', () {
      expect(
        GoogleTrackingMap.builderFor(
          const AppConfig(mapsEnabled: true),
          end: _task,
          runner: _me,
          routeTo: _task,
        ),
        isNotNull,
      );
    });
  });
}
