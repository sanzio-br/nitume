import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import 'runner_live.dart';

/// Drives R-20 [LocationPinger] from the runner's state (rows 27, 123,
/// 245): offline → nothing; online without a working job → idle 30 s pings
/// (foreground only); a working job (RUNNER_EN_ROUTE, ARRIVED,
/// IN_PROGRESS) → job pings with that `errandId` only. AWAITING_CUSTOMER,
/// DISPUTED, ended and reassigned jobs never get job pings.
///
/// One [LocationPinger] per app run, created with the real foreground
/// state (`WidgetsBinding.lifecycleState == resumed`) and wired to the app
/// lifecycle through [LocationPingerLifecycle] (row 245). Job pings use the
/// location foreground service (Android) / background updates (iOS), which
/// the pinger only starts while the app is visible; started, they keep
/// going when the runner switches apps or locks the phone.
///
/// Nothing here asks for a location permission, and no job, transition or
/// evidence ever waits on [status] (`v-active` only shows a notice).
class JobPings {
  JobPings({
    required PositionSource source,
    required this.live,
    this.onJobPingsStopped,
    this.collect = true,
    bool? appInForeground,
  }) {
    pinger = LocationPinger(
      source: source,
      onPing: send,
      onStatus: (s) => status.value = s,
      appInForeground: appInForeground ?? _bindingInForeground(),
    );
    if (collect) _lifecycle = LocationPingerLifecycle(pinger)..attach();
  }

  final RunnerLive live;

  /// False in widget tests: the wanted [mode] is tracked but no position
  /// is collected (no timers, no lifecycle observer).
  final bool collect;
  PingMode _mode = const PingOffline();
  LocationPingerLifecycle? _lifecycle;

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

  /// The cadence wanted now (applied to [pinger] when [collect]).
  PingMode get mode => _mode;

  /// The runner's availability (online or busy = true).
  void setOnline(bool online) {
    _online = online;
    _apply();
  }

  /// The working job (or `null` when there is none). Called at accept, on
  /// every held-jobs reload (app open with a working job), when `v-active`
  /// shows a working job, and with `null` (or another job) when the job
  /// finishes, reaches AWAITING_CUSTOMER or is reassigned. The same job
  /// again restarts a job stream the system ended, while the app is in the
  /// foreground (`LocationPinger.setMode`); resume is handled by
  /// [LocationPingerLifecycle].
  void setWorkingJob(String? errandId) {
    _workingJob = errandId;
    _apply();
  }

  /// Log out: stop everything.
  void reset() {
    _online = false;
    _workingJob = null;
    _apply();
  }

  /// Stops observing the lifecycle and collecting.
  void dispose() {
    _lifecycle?.detach();
    _lifecycle = null;
    pinger.dispose();
  }

  void _apply() {
    final job = _workingJob;
    _mode = job != null
        ? PingActiveJob(job)
        : _online
        ? const PingIdle()
        : const PingOffline();
    if (collect) pinger.setMode(_mode);
  }

  static bool _bindingInForeground() {
    try {
      return WidgetsBinding.instance.lifecycleState ==
          AppLifecycleState.resumed;
    } on Object {
      // No binding yet: assume background, so a job stream waits for the
      // first resume instead of starting from the background (row 245).
      return false;
    }
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
