import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

import 'runner_live.dart';

/// Drives R-20 [LocationPinger] from the runner's state (rows 27, 123):
/// offline → nothing; online without a working job → idle 30 s pings
/// (foreground only); a working job (RUNNER_EN_ROUTE, ARRIVED,
/// IN_PROGRESS) → job pings with that `errandId` only. AWAITING_CUSTOMER
/// and DISPUTED jobs never get job pings.
///
/// HOLD (BOARD rows 245, 246 open): the Android location foreground
/// service and its start/restart rule are not wired. Job pings therefore
/// run while the app is in the foreground only ([_ForegroundOnly]); the
/// background part waits for the owner's answer.
class JobPings {
  JobPings({
    required PositionSource source,
    required this.live,
    this.onJobPingsStopped,
  }) {
    pinger = LocationPinger(
      source: _ForegroundOnly(source),
      onPing: send,
      onStatus: (s) => status.value = s,
    );
  }

  final RunnerLive live;

  /// The server refused job pings for [errandId] (`not_live`, `forbidden`):
  /// the job moved on; reload the held jobs.
  final void Function(String errandId)? onJobPingsStopped;
  late final LocationPinger pinger;

  /// Location health for the `Location is off…` notice.
  final ValueNotifier<PingerStatus> status = ValueNotifier(PingerStatus.ok);

  bool _online = false;
  String? _workingJob;

  /// The errand job pings are sent for; `null` when none.
  String? get workingJob => _workingJob;
  PingMode get mode => pinger.mode;

  /// The runner's availability (online or busy = true).
  void setOnline(bool online) {
    _online = online;
    _apply();
  }

  /// The working job (or `null` when there is none).
  void setWorkingJob(String? errandId) {
    _workingJob = errandId;
    _apply();
  }

  /// App lifecycle: idle pings pause in the background.
  void setForeground(bool foreground) => pinger.setAppForeground(foreground);

  /// Log out: stop everything.
  void reset() {
    _online = false;
    _workingJob = null;
    _apply();
  }

  void _apply() {
    final job = _workingJob;
    pinger.setMode(
      job != null
          ? PingActiveJob(job)
          : _online
          ? const PingIdle()
          : const PingOffline(),
    );
  }

  /// Sends one ping and handles its ack (the pinger's `onPing`).
  @visibleForTesting
  Future<void> send(LocationPing ping) async {
    final ack = await live.sendLocationPing(ping);
    final id = ping.errandId;
    if (ack.stopJobPings && id != null && id == _workingJob) {
      _workingJob = null;
      _apply();
      onJobPingsStopped?.call(id);
    }
  }
}

/// Never asks for background updates (no foreground service) until rows
/// 245 / 246 are answered.
class _ForegroundOnly implements PositionSource {
  _ForegroundOnly(this._inner);

  final PositionSource _inner;

  @override
  Future<LocationAccess> access() => _inner.access();

  @override
  Future<LocationAccess> requestAccess() => _inner.requestAccess();

  @override
  Future<DevicePosition?> current() => _inner.current();

  @override
  Stream<DevicePosition> positions({
    required Duration interval,
    double distanceFilterMeters = 0,
    bool background = false,
  }) => _inner.positions(
    interval: interval,
    distanceFilterMeters: distanceFilterMeters,
  );
}
