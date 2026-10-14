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

/// What the pinger is doing (owner row 123). Modes compare by value, so
/// setting the same mode again is a no-op.
sealed class PingMode {
  const PingMode();
}

/// Offline: no location collection at all.
final class PingOffline extends PingMode {
  const PingOffline();

  @override
  bool operator ==(Object other) => other is PingOffline;

  @override
  int get hashCode => (PingOffline).hashCode;
}

/// Online without a job: one fix every [LocationPinger.idleInterval] while
/// the app is in the foreground; paused in the background.
final class PingIdle extends PingMode {
  const PingIdle();

  @override
  bool operator ==(Object other) => other is PingIdle;

  @override
  int get hashCode => (PingIdle).hashCode;
}

/// The live job window after the runner accepted: RUNNER_EN_ROUTE, ARRIVED
/// and IN_PROGRESS (row 113; `_shared.md` §10). Pings every 4–8 s, sooner
/// when moved 15 m (§4.2), in the background too. Stop at
/// AWAITING_CUSTOMER, any terminal state and on reassignment.
final class PingActiveJob extends PingMode {
  const PingActiveJob(this.errandId);

  final String errandId;

  @override
  bool operator ==(Object other) =>
      other is PingActiveJob && other.errandId == errandId;

  @override
  int get hashCode => errandId.hashCode;
}

/// Health of location collection, for a screen notice
/// (`Location is off…`).
enum PingerStatus {
  /// Fixes are arriving (or nothing is being collected).
  ok,

  /// The last attempt produced no fix: services off, permission revoked or
  /// a stream error.
  locationUnavailable,
}

/// R-20. Collects device positions and hands `location:ping` payloads to
/// [onPing] at the cadence approved by the owner (row 123):
///
/// * [PingOffline]: nothing; any stream or timer is cancelled.
/// * [PingIdle] (online, no job): one fresh fix every [idleInterval]
///   (30 s, first one at once), no `errandId`, no continuous stream, and
///   **only while the app is in the foreground** ([setAppForeground]).
/// * [PingActiveJob]: a continuous stream with background updates; a ping
///   when moved [activeDistanceMeters] (15 m) at most every
///   [activeMinInterval] (4 s), and a heartbeat with a **fresh**
///   `current()` fix (falling back to the latest streamed one) at least
///   every [activeMaxInterval] (8 s). The only mode that collects in the
///   background.
///
/// Errors (location services off, permission revoked) never escape: they
/// set [status] to [PingerStatus.locationUnavailable] and call [onStatus].
/// [onPing] sends the payload; the socket producer is RA-4
/// (`RealtimeEvents.locationPing`).
class LocationPinger {
  LocationPinger({
    required this.source,
    required this.onPing,
    this.onStatus,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final PositionSource source;
  final void Function(LocationPing ping) onPing;
  final void Function(PingerStatus status)? onStatus;
  final DateTime Function() _clock;

  static const idleInterval = Duration(seconds: 30);
  static const activeMinInterval = Duration(seconds: 4);
  static const activeMaxInterval = Duration(seconds: 8);
  static const activeDistanceMeters = 15.0;

  PingMode _mode = const PingOffline();
  bool _foreground = true;
  PingerStatus _status = PingerStatus.ok;
  StreamSubscription<DevicePosition>? _sub;
  Timer? _timer;
  int _run = 0;
  DevicePosition? _latest;
  DevicePosition? _lastSent;
  DateTime? _lastSentAt;

  PingMode get mode => _mode;
  PingerStatus get status => _status;
  bool get appInForeground => _foreground;

  /// True while positions are being collected.
  bool get collecting => _sub != null || _timer != null;

  /// Switches cadence. Setting the same mode again is a no-op.
  void setMode(PingMode mode) {
    if (mode == _mode) return;
    _mode = mode;
    _restart();
  }

  /// Call from the app lifecycle (resumed → `true`; paused/hidden →
  /// `false`). Idle pinging pauses in the background; an active job keeps
  /// going.
  void setAppForeground(bool foreground) {
    if (foreground == _foreground) return;
    _foreground = foreground;
    if (_mode is PingIdle) _restart();
  }

  void _restart() {
    _stop();
    final run = ++_run;
    switch (_mode) {
      case PingOffline():
        _setStatus(PingerStatus.ok);
      case PingIdle():
        if (!_foreground) return;
        // One fix per ping; no continuous stream while idle (battery).
        _timer = Timer.periodic(idleInterval, (_) => _sampleIdle(run));
        _sampleIdle(run);
      case PingActiveJob():
        _sub = source
            .positions(
              interval: activeMinInterval,
              distanceFilterMeters: activeDistanceMeters,
              background: true,
            )
            .listen(
              (p) => _onActiveFix(p, run),
              onError: (Object _) =>
                  _setStatus(PingerStatus.locationUnavailable),
            );
        _armHeartbeat(run);
    }
  }

  Future<DevicePosition?> _fresh() async {
    try {
      final p = await source.current();
      _setStatus(
        p == null ? PingerStatus.locationUnavailable : PingerStatus.ok,
      );
      return p;
    } on Object {
      _setStatus(PingerStatus.locationUnavailable);
      return null;
    }
  }

  Future<void> _sampleIdle(int run) async {
    final p = await _fresh();
    if (p == null || run != _run) return;
    _latest = p;
    _send();
  }

  /// Active mode: guarantees a ping at least every [activeMaxInterval],
  /// re-armed after each ping.
  void _armHeartbeat(int run) {
    _timer?.cancel();
    _timer = Timer(activeMaxInterval, () => _heartbeat(run));
  }

  Future<void> _heartbeat(int run) async {
    final p = await _fresh();
    if (run != _run) return;
    if (p != null) _latest = p;
    _send();
    _armHeartbeat(run);
  }

  void _onActiveFix(DevicePosition p, int run) {
    if (run != _run) return;
    _latest = p;
    _setStatus(PingerStatus.ok);
    final at = _lastSentAt;
    final last = _lastSent;
    if (at == null || last == null) {
      _send();
      _armHeartbeat(run);
      return;
    }
    final elapsed = _clock().difference(at);
    if (elapsed >= activeMinInterval &&
        p.distanceTo(last) >= activeDistanceMeters) {
      _send();
      _armHeartbeat(run);
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

  void _setStatus(PingerStatus s) {
    if (s == _status) return;
    _status = s;
    onStatus?.call(s);
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
    _run++;
    _stop();
    _mode = const PingOffline();
  }
}
