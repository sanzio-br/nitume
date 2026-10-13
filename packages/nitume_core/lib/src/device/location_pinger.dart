import 'dart:async';

import 'package:flutter/foundation.dart';

import 'position_source.dart';

/// Payload of `location:ping` (system design §4.2):
/// `{ lat, lng, errandId?, accuracy?, ts }`.
@immutable
class LocationPing {
  const LocationPing({required this.position, this.errandId});

  final DevicePosition position;

  /// The accepted job the ping belongs to; `null` for idle online pings.
  final String? errandId;

  Map<String, Object?> toJson() => {
    'lat': position.lat,
    'lng': position.lng,
    'errandId': ?errandId,
    'accuracy': ?position.accuracy,
    'ts': position.timestamp.toUtc().toIso8601String(),
  };
}

/// What the pinger is doing (owner row 123).
sealed class PingMode {
  const PingMode();
}

/// Offline: no location collection at all.
final class PingOffline extends PingMode {
  const PingOffline();
}

/// Online without a job: one ping every [LocationPinger.idleInterval].
final class PingIdle extends PingMode {
  const PingIdle();
}

/// Holding an accepted job in RUNNER_ASSIGNED … IN_PROGRESS: pings every
/// 4–8 s, sooner when moved 15 m (§4.2), in the background too.
final class PingActiveJob extends PingMode {
  const PingActiveJob(this.errandId);

  final String errandId;

  @override
  bool operator ==(Object other) =>
      other is PingActiveJob && other.errandId == errandId;

  @override
  int get hashCode => errandId.hashCode;
}

/// R-20. Collects device positions and hands `location:ping` payloads to
/// [onPing] at the cadence approved by the owner (row 123):
///
/// * [PingOffline]: nothing; the position stream is cancelled, so the
///   device stops collecting.
/// * [PingIdle] (online, no job): one fix every [idleInterval] (30 s,
///   first one at once), no `errandId`, no continuous stream.
/// * [PingActiveJob]: at most every [activeMinInterval] (4 s) once moved
///   [activeDistanceMeters] (15 m), and at least every [activeMaxInterval]
///   (8 s) with the latest fix.
///
/// The screen sets the mode from the runner's availability and job state
/// (stop at AWAITING_CUSTOMER, any terminal state, reassignment, and when
/// going offline). [onPing] sends the payload; the socket producer is RA-4
/// (`RealtimeEvents.locationPing`).
class LocationPinger {
  LocationPinger({
    required this.source,
    required this.onPing,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final PositionSource source;
  final void Function(LocationPing ping) onPing;
  final DateTime Function() _clock;

  static const idleInterval = Duration(seconds: 30);
  static const activeMinInterval = Duration(seconds: 4);
  static const activeMaxInterval = Duration(seconds: 8);
  static const activeDistanceMeters = 15.0;

  PingMode _mode = const PingOffline();
  StreamSubscription<DevicePosition>? _sub;
  Timer? _timer;
  DevicePosition? _latest;
  DevicePosition? _lastSent;
  DateTime? _lastSentAt;

  PingMode get mode => _mode;

  /// True while positions are being collected.
  bool get collecting => _sub != null || _timer != null;

  /// Switches cadence. Setting the same mode again is a no-op.
  void setMode(PingMode mode) {
    if (mode == _mode && (mode is PingOffline || collecting)) return;
    _stop();
    _mode = mode;
    switch (mode) {
      case PingOffline():
        return;
      case PingIdle():
        // One fix per ping; no continuous stream while idle (battery).
        _timer = Timer.periodic(idleInterval, (_) => _sampleIdle());
        _sampleIdle();
      case PingActiveJob():
        _sub = source
            .positions(
              interval: activeMinInterval,
              distanceFilterMeters: activeDistanceMeters,
              background: true,
            )
            .listen(_onActiveFix);
        _armMaxTimer();
    }
  }

  Future<void> _sampleIdle() async {
    final p = await source.current();
    if (p == null || _mode is! PingIdle) return;
    _latest = p;
    _send();
  }

  /// Active mode: guarantees a ping at least every [activeMaxInterval]
  /// (re-armed after each ping).
  void _armMaxTimer() {
    _timer?.cancel();
    _timer = Timer(activeMaxInterval, () {
      _send();
      _armMaxTimer();
    });
  }

  void _onActiveFix(DevicePosition p) {
    _latest = p;
    final at = _lastSentAt;
    final last = _lastSent;
    if (at == null || last == null) {
      _send();
      _armMaxTimer();
      return;
    }
    final elapsed = _clock().difference(at);
    if (elapsed >= activeMinInterval &&
        p.distanceTo(last) >= activeDistanceMeters) {
      _send();
      _armMaxTimer();
    }
  }

  void _send() {
    final p = _latest;
    if (p == null) return;
    final mode = _mode;
    _lastSent = p;
    _lastSentAt = _clock();
    onPing(
      LocationPing(
        position: p,
        errandId: mode is PingActiveJob ? mode.errandId : null,
      ),
    );
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
    _sub?.cancel();
    _sub = null;
    _latest = null;
    _lastSent = null;
    _lastSentAt = null;
  }

  /// Stops collecting (same as [PingOffline]).
  void dispose() {
    _stop();
    _mode = const PingOffline();
  }
}
