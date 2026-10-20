import 'dart:async';

import 'package:flutter/widgets.dart';

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
/// setting the same mode again changes nothing, except that a
/// [PingActiveJob] whose stream the system ended restarts it (foreground
/// only, see [LocationPinger.setMode]).
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
///
/// While-in-use permission only (owner row 245): collection **starts only
/// while the app is in the foreground** (Android location foreground
/// service, iOS `location` background mode) and then keeps running when the
/// runner switches apps or locks the phone. Set from the background, it
/// waits until [LocationPinger.setAppForeground] reports the app visible.
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
/// Foreground-start rule (owner row 245, C-V5): the active stream (the
/// Android location foreground service with its notification, or iOS
/// background updates) is only ever **started** while the app is in the
/// foreground. Set while the app is in the background, or when the system
/// ended the stream (service stopped), it waits ([waitingForForeground])
/// and starts on the next `setAppForeground(true)`, or at once when
/// `setMode` is called again with the same job while the app is visible.
/// Once started it keeps running in the background until the mode
/// changes. Switching from one
/// [PingActiveJob] to another keeps the running stream. The pinger never
/// asks for a permission; a refusal only sets [status].
///
/// On app start with a working job, create the pinger with the real
/// [appInForeground] state and call `setMode(PingActiveJob(id))`: pings
/// restart at once (after a force-quit or a killed service). Wire the
/// lifecycle with [LocationPingerLifecycle].
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
    bool appInForeground = true,
  }) : _clock = clock ?? DateTime.now,
       _foreground = appInForeground;

  final PositionSource source;
  final void Function(LocationPing ping) onPing;
  final void Function(PingerStatus status)? onStatus;
  final DateTime Function() _clock;

  static const idleInterval = Duration(seconds: 30);
  static const activeMinInterval = Duration(seconds: 4);
  static const activeMaxInterval = Duration(seconds: 8);
  static const activeDistanceMeters = 15.0;

  PingMode _mode = const PingOffline();
  bool _foreground;
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

  /// True when the mode is [PingActiveJob] but its stream is not running
  /// because it may only start in the foreground (row 245). It starts on the
  /// next `setAppForeground(true)`.
  bool get waitingForForeground => _mode is PingActiveJob && _sub == null;

  /// Switches cadence. Setting the same mode again is a no-op, with one
  /// exception: the same [PingActiveJob] while its stream is not running
  /// ([waitingForForeground], e.g. the system ended it) and the app is in
  /// the foreground restarts the stream at once instead of waiting for the
  /// next resume. From the background it still waits (row 245). Never asks
  /// for a permission and never throws.
  void setMode(PingMode mode) {
    if (mode == _mode) {
      if (mode is PingActiveJob && _sub == null && _foreground) _restart();
      return;
    }
    final previous = _mode;
    _mode = mode;
    if (previous is PingActiveJob && mode is PingActiveJob && _sub != null) {
      // Another working job: keep the running stream (it could not be
      // restarted from the background), ping for the new job at once.
      _lastSent = null;
      _lastSentAt = null;
      _send();
      _armHeartbeat(_run);
      return;
    }
    _restart();
  }

  /// Call from the app lifecycle (resumed → `true`; paused/hidden →
  /// `false`), or use [LocationPingerLifecycle]. Idle pinging pauses in the
  /// background; an active job keeps going, and an active job that is
  /// [waitingForForeground] starts here.
  void setAppForeground(bool foreground) {
    if (foreground == _foreground) return;
    _foreground = foreground;
    switch (_mode) {
      case PingIdle():
        _restart();
      case PingActiveJob() when foreground && _sub == null:
        _restart();
      case _:
        break;
    }
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
        // Never start the foreground service / background updates from the
        // background (row 245); wait for the app to be visible.
        if (!_foreground) return;
        try {
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
                onDone: () => _onActiveDone(run),
              );
        } on Object {
          // A source that fails to open never escapes; the heartbeat keeps
          // trying current() and a later setMode / resume retries.
          _sub = null;
          _setStatus(PingerStatus.locationUnavailable);
        }
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

  /// The system ended the stream (e.g. it stopped the service). The
  /// heartbeat keeps trying `current()`; the stream restarts on the next
  /// `setAppForeground(true)`, or on `setMode` with the same job while the
  /// app is in the foreground (never from the background).
  void _onActiveDone(int run) {
    if (run != _run) return;
    _sub = null;
    _setStatus(PingerStatus.locationUnavailable);
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

/// Forwards the app lifecycle to [LocationPinger.setAppForeground]
/// (row 245): `resumed` → foreground; `hidden`, `paused` and `detached` →
/// background; `inactive` (a system sheet over the app) changes nothing.
///
/// ```dart
/// final lifecycle = LocationPingerLifecycle(pinger)..attach();
/// // …
/// lifecycle.detach();
/// ```
///
/// [attach] also applies the current state once, so a pinger created
/// before the first frame learns whether the app is visible.
class LocationPingerLifecycle with WidgetsBindingObserver {
  LocationPingerLifecycle(this.pinger);

  final LocationPinger pinger;
  bool _attached = false;

  /// Starts observing [WidgetsBinding.instance]; a second call is a no-op.
  void attach() {
    if (_attached) return;
    _attached = true;
    final binding = WidgetsBinding.instance;
    binding.addObserver(this);
    final state = binding.lifecycleState;
    if (state != null) didChangeAppLifecycleState(state);
  }

  /// Stops observing.
  void detach() {
    if (!_attached) return;
    _attached = false;
    WidgetsBinding.instance.removeObserver(this);
  }

  /// Foreground (`true`), background (`false`) or no change (`null`).
  @visibleForTesting
  static bool? isForeground(AppLifecycleState state) => switch (state) {
    AppLifecycleState.resumed => true,
    AppLifecycleState.hidden ||
    AppLifecycleState.paused ||
    AppLifecycleState.detached => false,
    AppLifecycleState.inactive => null,
  };

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = isForeground(state);
    if (foreground != null) pinger.setAppForeground(foreground);
  }
}
