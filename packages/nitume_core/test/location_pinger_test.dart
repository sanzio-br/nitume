import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _FakeSource implements PositionSource {
  final controller = StreamController<DevicePosition>.broadcast();
  DevicePosition? currentFix;
  int currentCalls = 0;
  ({Duration interval, double distance, bool background})? lastStream;

  @override
  Future<LocationAccess> access() async => LocationAccess.whileInUse;

  @override
  Future<LocationAccess> requestAccess() async => LocationAccess.whileInUse;

  @override
  Future<DevicePosition?> current() async {
    currentCalls++;
    return currentFix;
  }

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) {
    lastStream = (
      interval: interval,
      distance: distanceFilterMeters,
      background: background,
    );
    return controller.stream;
  }
}

DevicePosition _at(double lat, [double lng = 39.71]) =>
    DevicePosition(lat: lat, lng: lng, timestamp: DateTime.utc(2026, 10, 13));

void main() {
  // ~0.0002° latitude ≈ 22 m; 0.00005° ≈ 5.5 m.
  testWidgets('offline collects nothing', (tester) async {
    final source = _FakeSource();
    final pings = <LocationPing>[];
    final p = LocationPinger(source: source, onPing: pings.add);
    p.setMode(const PingOffline());
    await tester.pump(const Duration(minutes: 2));
    expect(p.collecting, isFalse);
    expect(source.currentCalls, 0);
    expect(source.lastStream, isNull);
    expect(pings, isEmpty);
  });

  testWidgets('idle: one fix every 30 s, no errandId, no stream', (
    tester,
  ) async {
    final source = _FakeSource()..currentFix = _at(-4.03);
    final pings = <LocationPing>[];
    final p = LocationPinger(source: source, onPing: pings.add);
    p.setMode(const PingIdle());
    await tester.pump();
    expect(pings, hasLength(1));
    await tester.pump(const Duration(seconds: 29));
    expect(pings, hasLength(1));
    await tester.pump(const Duration(seconds: 1));
    expect(pings, hasLength(2));
    expect(source.lastStream, isNull);
    expect(pings.first.errandId, isNull);
    expect(pings.first.toJson().containsKey('errandId'), isFalse);

    p.setMode(const PingOffline());
    await tester.pump(const Duration(minutes: 1));
    expect(pings, hasLength(2));
    expect(p.collecting, isFalse);
  });

  testWidgets('active job: 15 m / 4 s throttle and 8 s ceiling', (
    tester,
  ) async {
    var now = DateTime.utc(2026, 10, 13, 7);
    Future<void> advance(Duration d) async {
      now = now.add(d);
      await tester.pump(d);
    }

    final source = _FakeSource();
    final pings = <LocationPing>[];
    final p = LocationPinger(
      source: source,
      onPing: pings.add,
      clock: () => now,
    );
    p.setMode(const PingActiveJob('e1'));
    expect(source.lastStream!.background, isTrue);
    expect(source.lastStream!.distance, 15);

    source.controller.add(_at(-4.0300));
    await tester.pump();
    expect(pings, hasLength(1));
    expect(pings.single.errandId, 'e1');
    expect(pings.single.toJson()['errandId'], 'e1');

    // Moved 22 m but only 2 s later: throttled.
    await advance(const Duration(seconds: 2));
    source.controller.add(_at(-4.0302));
    await tester.pump();
    expect(pings, hasLength(1));

    // 4 s after the last ping and moved: sent.
    await advance(const Duration(seconds: 2));
    source.controller.add(_at(-4.0304));
    await tester.pump();
    expect(pings, hasLength(2));

    // Small move only: not sent until the 8 s ceiling.
    await advance(const Duration(seconds: 5));
    source.controller.add(_at(-4.03045));
    await tester.pump();
    expect(pings, hasLength(2));
    await advance(const Duration(seconds: 3));
    expect(pings, hasLength(3));
    await advance(const Duration(seconds: 8));
    expect(pings, hasLength(4));

    // Going offline stops collection immediately.
    p.setMode(const PingOffline());
    expect(source.controller.hasListener, isFalse);
    await advance(const Duration(seconds: 30));
    expect(pings, hasLength(4));
  });

  test('DevicePosition.distanceTo is a haversine in metres', () {
    final a = DevicePosition(
      lat: -4.03,
      lng: 39.71,
      timestamp: DateTime.utc(2026),
    );
    // 0.0002° of latitude ≈ 22.2 m.
    final b = DevicePosition(
      lat: -4.0302,
      lng: 39.71,
      timestamp: DateTime.utc(2026),
    );
    expect(a.distanceTo(b), closeTo(22.24, 0.05));
    expect(a.distanceTo(a), 0);
    // Nairobi CBD → Mombasa ≈ 441 km.
    final nbo = DevicePosition(
      lat: -1.2864,
      lng: 36.8172,
      timestamp: DateTime.utc(2026),
    );
    final msa = DevicePosition(
      lat: -4.0435,
      lng: 39.6682,
      timestamp: DateTime.utc(2026),
    );
    expect(nbo.distanceTo(msa) / 1000, closeTo(441, 3));
  });
}
