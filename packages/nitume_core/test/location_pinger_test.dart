import 'dart:async';

import 'package:flutter/widgets.dart';
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

  Object? currentError;

  @override
  Future<DevicePosition?> current() async {
    currentCalls++;
    final e = currentError;
    if (e != null) throw e;
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

/// A source that opens a new stream per `positions()` call (so a stream
/// the system ended can be reopened) and counts permission requests.
class _ReopeningSource implements PositionSource {
  final streams = <StreamController<DevicePosition>>[];
  int requests = 0;
  Object? openError;

  @override
  Future<LocationAccess> access() async => LocationAccess.whileInUse;

  @override
  Future<LocationAccess> requestAccess() async {
    requests++;
    return LocationAccess.whileInUse;
  }

  @override
  Future<DevicePosition?> current() async => null;

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) {
    final e = openError;
    if (e != null) throw e;
    final c = StreamController<DevicePosition>();
    streams.add(c);
    return c.stream;
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

  group('foreground-start rule (row 245)', () {
    testWidgets('active job set in the background waits for the foreground', (
      tester,
    ) async {
      final source = _FakeSource()..currentFix = _at(-4.03);
      final pings = <LocationPing>[];
      final p = LocationPinger(
        source: source,
        onPing: pings.add,
        appInForeground: false,
      );
      p.setMode(const PingActiveJob('e1'));
      await tester.pump(const Duration(seconds: 20));
      expect(source.lastStream, isNull);
      expect(source.currentCalls, 0);
      expect(p.collecting, isFalse);
      expect(p.waitingForForeground, isTrue);
      expect(pings, isEmpty);

      p.setAppForeground(true);
      expect(source.lastStream!.background, isTrue);
      expect(p.waitingForForeground, isFalse);
      source.controller.add(_at(-4.03));
      await tester.pump();
      expect(pings.single.errandId, 'e1');
      p.dispose();
    });

    testWidgets('a started stream keeps running in the background', (
      tester,
    ) async {
      final source = _FakeSource()..currentFix = _at(-4.03);
      final pings = <LocationPing>[];
      final p = LocationPinger(source: source, onPing: pings.add);
      p.setMode(const PingActiveJob('e1'));
      p.setAppForeground(false);
      expect(source.controller.hasListener, isTrue);
      await tester.pump(const Duration(seconds: 8));
      expect(pings, hasLength(1));
      expect(pings.single.errandId, 'e1');

      // Job finished: the stream (foreground service) stops.
      p.setMode(const PingIdle());
      expect(source.controller.hasListener, isFalse);
      await tester.pump(const Duration(minutes: 1));
      expect(pings, hasLength(1));
      p.dispose();
    });

    testWidgets('another working job keeps the running stream', (tester) async {
      final source = _FakeSource()..currentFix = _at(-4.03);
      final pings = <LocationPing>[];
      final p = LocationPinger(source: source, onPing: pings.add);
      p.setMode(const PingActiveJob('e1'));
      source.controller.add(_at(-4.03));
      await tester.pump();
      p.setAppForeground(false);
      source.lastStream = null;
      p.setMode(const PingActiveJob('e2'));
      expect(source.lastStream, isNull, reason: 'no new stream');
      expect(source.controller.hasListener, isTrue);
      expect(pings.last.errandId, 'e2');
      p.dispose();
    });

    testWidgets('stream ended by the system restarts only in the foreground', (
      tester,
    ) async {
      final source = _FakeSource();
      final statuses = <PingerStatus>[];
      final p = LocationPinger(
        source: source,
        onPing: (_) {},
        onStatus: statuses.add,
      );
      p.setMode(const PingActiveJob('e1'));
      p.setAppForeground(false);
      source.lastStream = null;
      await source.controller.close();
      await tester.pump(const Duration(seconds: 20));
      expect(p.waitingForForeground, isTrue);
      expect(statuses.last, PingerStatus.locationUnavailable);
      expect(source.lastStream, isNull, reason: 'never from the background');

      p.setAppForeground(true);
      expect(source.lastStream!.background, isTrue);
      p.dispose();
    });

    testWidgets(
      'same job again restarts a stream the system ended (foreground)',
      (tester) async {
        final source = _ReopeningSource();
        final pings = <LocationPing>[];
        final p = LocationPinger(source: source, onPing: pings.add);
        p.setMode(const PingActiveJob('e1'));
        expect(source.streams, hasLength(1));
        await source.streams.single.close();
        await tester.pump();
        expect(p.waitingForForeground, isTrue);

        p.setMode(const PingActiveJob('e1'));
        expect(source.streams, hasLength(2), reason: 'reopened at once');
        expect(p.waitingForForeground, isFalse);
        source.streams.last.add(_at(-4.03));
        await tester.pump();
        expect(pings.last.errandId, 'e1');

        // Running: the same job again changes nothing.
        p.setMode(const PingActiveJob('e1'));
        expect(source.streams, hasLength(2));
        expect(source.requests, 0, reason: 'never asks for permission');
        p.dispose();
      },
    );

    testWidgets('same job again from the background still waits', (
      tester,
    ) async {
      final source = _ReopeningSource();
      final p = LocationPinger(source: source, onPing: (_) {});
      p.setMode(const PingActiveJob('e1'));
      p.setAppForeground(false);
      await source.streams.single.close();
      await tester.pump();

      p.setMode(const PingActiveJob('e1'));
      expect(source.streams, hasLength(1), reason: 'never from background');
      expect(p.waitingForForeground, isTrue);

      p.setAppForeground(true);
      expect(source.streams, hasLength(2));
      p.dispose();
    });

    testWidgets('a source that fails to open never throws', (tester) async {
      final source = _ReopeningSource()..openError = StateError('denied');
      final statuses = <PingerStatus>[];
      final p = LocationPinger(
        source: source,
        onPing: (_) {},
        onStatus: statuses.add,
      );
      p.setMode(const PingActiveJob('e1'));
      expect(p.waitingForForeground, isTrue);
      expect(statuses, [PingerStatus.locationUnavailable]);
      p.setMode(const PingActiveJob('e1'));
      source.openError = null;
      p.setMode(const PingActiveJob('e1'));
      expect(source.streams, hasLength(1));
      expect(source.requests, 0);
      await tester.pump(const Duration(seconds: 8));
      p.dispose();
    });

    testWidgets('location refused never throws; status reports it', (
      tester,
    ) async {
      final source = _FakeSource()..currentError = StateError('denied');
      final statuses = <PingerStatus>[];
      final p = LocationPinger(
        source: source,
        onPing: (_) {},
        onStatus: statuses.add,
      );
      p.setMode(const PingActiveJob('e1'));
      source.controller.addError(StateError('denied'));
      await tester.pump(const Duration(seconds: 8));
      expect(p.status, PingerStatus.locationUnavailable);
      expect(statuses, [PingerStatus.locationUnavailable]);
      p.dispose();
    });
  });

  group('LocationPingerLifecycle', () {
    test('maps lifecycle states', () {
      expect(
        LocationPingerLifecycle.isForeground(AppLifecycleState.resumed),
        isTrue,
      );
      for (final s in [
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
        AppLifecycleState.detached,
      ]) {
        expect(LocationPingerLifecycle.isForeground(s), isFalse);
      }
      expect(
        LocationPingerLifecycle.isForeground(AppLifecycleState.inactive),
        isNull,
      );
    });

    testWidgets('forwards binding lifecycle changes to the pinger', (
      tester,
    ) async {
      final source = _FakeSource()..currentFix = _at(-4.03);
      final p = LocationPinger(source: source, onPing: (_) {});
      final lifecycle = LocationPingerLifecycle(p)..attach();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      expect(p.appInForeground, isFalse);
      p.setMode(const PingActiveJob('e1'));
      expect(p.waitingForForeground, isTrue);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(p.appInForeground, isTrue);
      expect(p.waitingForForeground, isFalse);
      lifecycle.detach();
      p.dispose();
    });
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

  testWidgets('idle pauses in the background; active keeps going (B3)', (
    tester,
  ) async {
    final source = _FakeSource()..currentFix = _at(-4.03);
    final pings = <LocationPing>[];
    final p = LocationPinger(source: source, onPing: pings.add);
    p.setMode(const PingIdle());
    await tester.pump();
    expect(pings, hasLength(1));

    p.setAppForeground(false);
    expect(p.collecting, isFalse);
    await tester.pump(const Duration(minutes: 2));
    expect(pings, hasLength(1));
    expect(source.lastStream, isNull, reason: 'idle never streams');

    p.setAppForeground(true);
    await tester.pump();
    expect(pings, hasLength(2), reason: 'samples at once on resume');

    // Active job: background updates requested and continue in background.
    p.setMode(const PingActiveJob('e1'));
    expect(source.lastStream!.background, isTrue);
    p.setAppForeground(false);
    expect(p.collecting, isTrue);
    expect(source.controller.hasListener, isTrue);
    p.dispose();
  });

  testWidgets('re-setting an equal mode is a no-op (item 5)', (tester) async {
    final source = _FakeSource()..currentFix = _at(-4.03);
    final p = LocationPinger(source: source, onPing: (_) {});
    // ignore: prefer_const_constructors
    p.setMode(PingIdle());
    await tester.pump();
    // ignore: prefer_const_constructors
    p.setMode(PingIdle());
    await tester.pump();
    expect(source.currentCalls, 1);
    // ignore: prefer_const_constructors
    expect(PingOffline(), const PingOffline());
    expect(const PingActiveJob('a'), isNot(const PingActiveJob('b')));
    p.dispose();
  });

  testWidgets('heartbeat sends a fresh current() fix (item 6)', (tester) async {
    final source = _FakeSource();
    final pings = <LocationPing>[];
    final p = LocationPinger(source: source, onPing: pings.add);
    p.setMode(const PingActiveJob('e1'));
    source.controller.add(_at(-4.0300));
    await tester.pump();
    source.currentFix = _at(-4.0310);
    await tester.pump(const Duration(seconds: 8));
    expect(pings, hasLength(2));
    expect(pings.last.position.lat, -4.0310);
    p.dispose();
  });

  testWidgets('location errors are reported, never thrown (item 7)', (
    tester,
  ) async {
    final statuses = <PingerStatus>[];
    final source = _FakeSource()
      ..currentError = const LocationServiceDisabled();
    final pings = <LocationPing>[];
    final p = LocationPinger(
      source: source,
      onPing: pings.add,
      onStatus: statuses.add,
    );
    p.setMode(const PingIdle());
    await tester.pump();
    expect(p.status, PingerStatus.locationUnavailable);
    expect(pings, isEmpty);

    p.setMode(const PingActiveJob('e1'));
    source.controller.addError(const LocationServiceDisabled());
    await tester.pump();
    expect(p.status, PingerStatus.locationUnavailable);

    source.controller.add(_at(-4.03));
    await tester.pump();
    expect(p.status, PingerStatus.ok);
    expect(pings, hasLength(1));
    expect(statuses, [PingerStatus.locationUnavailable, PingerStatus.ok]);
    p.dispose();
  });
}

class LocationServiceDisabled implements Exception {
  const LocationServiceDisabled();
}
