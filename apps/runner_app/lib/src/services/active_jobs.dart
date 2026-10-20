import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:nitume_core/nitume_core.dart';

import '../util/display.dart';
import 'job_pings.dart';
import 'runner_live.dart';

/// `v-active` notices that do not belong to one screen visit (proposed copy,
/// `docs/specs/runner/v-active.md`).
abstract final class ActiveJobsCopy {
  static const revoked = 'This job is no longer assigned to you.';
  static const changed = 'This job changed. Showing the latest.';
  static const photosMissing = 'Upload photos to finish.';
  static const receiptMissing = 'Upload the receipt to finish.';
  static const photoGone =
      'This photo is no longer on your phone. Take it again.';
  static const photoRefused =
      "A photo couldn't be added to the job. Take it again.";
  static String refusedReplay(String label) =>
      "Couldn't update the job. It's now $label.";
}

/// Outcome of a runner action on a held job.
class JobActionResult {
  const JobActionResult._({this.queued = false, this.error, this.ok = true});

  /// Sent and accepted.
  const JobActionResult.done() : this._();

  /// No connection: saved in the R-21 queue; the screen shows the target
  /// state with the offline notice.
  const JobActionResult.queued() : this._(queued: true);

  /// Refused: show [error] once, in the danger tone.
  const JobActionResult.failed(String error) : this._(error: error, ok: false);

  final bool ok;
  final bool queued;
  final String? error;
}

/// The runner's held jobs at app scope (C-V3): loaded from
/// `GET /runners/me/jobs`, kept live from the errand rooms, and the single
/// place that changes them (transitions and notes, queued when offline,
/// R-21). Also feeds the working job to [JobPings], the rooms to
/// [RunnerLive] and the job ids to [JobEvidenceUploads].
class ActiveJobs extends ChangeNotifier {
  ActiveJobs({
    required this.jobs,
    required this.live,
    required this.pings,
    required this.uploads,
    required this._queue,
  }) {
    _subs.addAll([
      live.statusChanges.listen((e) {
        if (_isHeld(e.errandId)) unawaited(load());
      }),
      live.accessRevocations.listen((e) {
        if (_isHeld(e.errandId)) revoke(e.errandId);
      }),
      live.priceChangeDecisions.listen((e) {
        if (!_isHeld(e.errandId)) return;
        _priceDecided[e.errandId] = e;
        unawaited(load());
      }),
    ]);
  }

  final RunnerJobsRepository jobs;
  final RunnerLive live;
  final JobPings pings;
  final JobEvidenceUploads uploads;
  final OfflineActionQueue Function() _queue;
  final _subs = <StreamSubscription<Object?>>[];

  List<RunnerJobView> _held = const [];
  bool _loaded = false;
  bool _loading = false;
  Object? _error;
  String? _notice;
  final _optimisticStatus = <String, ErrandStatus>{};
  final _optimisticNotes = <String, String?>{};
  final _priceDecided = <String, PriceChangeDecided>{};

  /// Jobs the runner holds, the working job first (API order otherwise).
  List<RunnerJobView> get held => _held;
  bool get loaded => _loaded;
  bool get loading => _loading;

  /// Last load failure while nothing was loaded yet.
  Object? get error => _error;

  /// The working job (RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS), if any.
  RunnerJobView? get working {
    for (final j in _held) {
      if (RunnerJobsRepository.workingStatuses.contains(statusOf(j))) return j;
    }
    return null;
  }

  /// A one-off danger notice (revoked job, refused replay); read with
  /// [takeNotice].
  String? get notice => _notice;

  /// Returns and clears [notice].
  String? takeNotice() {
    final n = _notice;
    _notice = null;
    return n;
  }

  /// The last `price_change:decided` for [errandId] this session.
  PriceChangeDecided? priceDecision(String errandId) => _priceDecided[errandId];

  /// The state to show: a queued transition's target until the server
  /// confirms it (`_shared.md` §10 offline rule).
  ErrandStatus statusOf(RunnerJobView job) =>
      _optimisticStatus[job.id] ?? job.status;

  /// Runner notes to show (a queued save wins until replayed).
  String? notesOf(RunnerJobView job) => _optimisticNotes.containsKey(job.id)
      ? _optimisticNotes[job.id]
      : job.runnerNotes;

  /// True while an action for [errandId] waits in the offline queue.
  bool hasQueued(String errandId) => _queue().pendingFor(errandId).isNotEmpty;

  RunnerJobView? byId(String errandId) {
    for (final j in _held) {
      if (j.id == errandId) return j;
    }
    return null;
  }

  bool _isHeld(String errandId) => byId(errandId) != null;

  /// Reloads the held jobs. Never throws.
  Future<void> load() async {
    _loading = true;
    if (!_loaded) notifyListeners();
    try {
      final next = await jobs.heldJobs();
      _held = next;
      _loaded = true;
      _error = null;
      final queue = _queue();
      _optimisticStatus.removeWhere(
        (id, _) => !queue
            .pendingFor(id)
            .any((a) => a.kind == QueuedActionKind.statusTransition),
      );
      _optimisticNotes.removeWhere(
        (id, _) => !queue
            .pendingFor(id)
            .any((a) => a.kind == QueuedActionKind.runnerNotes),
      );
      _sync();
    } on Object catch (e) {
      if (!_loaded) _error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void _sync() {
    final ids = [for (final j in _held) j.id];
    live.syncRooms(ids);
    uploads.retainOnly(ids);
    pings.setWorkingJob(working?.id);
  }

  /// `errand:access_revoked` or a `job_not_held` read: drop the job, stop
  /// its pings and tell the runner.
  void revoke(String errandId) {
    if (!_isHeld(errandId)) return;
    _held = [
      for (final j in _held)
        if (j.id != errandId) j,
    ];
    _optimisticStatus.remove(errandId);
    _optimisticNotes.remove(errandId);
    _notice = ActiveJobsCopy.revoked;
    _sync();
    notifyListeners();
  }

  /// Runner transition (§3.3, actor R) with the offline rule.
  Future<JobActionResult> transition(
    RunnerJobView job,
    ErrandStatus to, {
    String? note,
  }) async {
    final from = statusOf(job);
    try {
      await jobs.transition(job.id, from: from, to: to, note: note);
      await load();
      return const JobActionResult.done();
    } on Object catch (e) {
      if (replayOutcomeFor(e) == ReplayOutcome.retryLater &&
          e is! ArgumentError) {
        final queued = await _tryEnqueue(
          QueuedActionKind.statusTransition,
          job.id,
          RunnerQueuedActions.transition(from: from, to: to, note: note),
        );
        if (!queued) return _failure(job.id, e);
        _optimisticStatus[job.id] = to;
        _sync();
        notifyListeners();
        return const JobActionResult.queued();
      }
      return _failure(job.id, e);
    }
  }

  /// Saves the runner notes (`null` clears), queued when offline.
  Future<JobActionResult> saveNotes(RunnerJobView job, String? notes) async {
    try {
      await jobs.updateRunnerNotes(job.id, notes);
      await load();
      return const JobActionResult.done();
    } on Object catch (e) {
      if (replayOutcomeFor(e) == ReplayOutcome.retryLater) {
        final queued = await _tryEnqueue(
          QueuedActionKind.runnerNotes,
          job.id,
          RunnerQueuedActions.runnerNotes(notes),
        );
        if (!queued) return _failure(job.id, e);
        _optimisticNotes[job.id] = notes;
        notifyListeners();
        return const JobActionResult.queued();
      }
      return _failure(job.id, e);
    }
  }

  /// Queues an action; `false` when the queue refuses it (closed after a
  /// log out, or the store failed). The caller then reports the original
  /// failure (`Check your connection and try again.`) and the runner can
  /// retry; nothing escapes as an unhandled error.
  Future<bool> _tryEnqueue(
    QueuedActionKind kind,
    String errandId,
    Map<String, Object?> payload,
  ) async {
    try {
      await _queue().enqueue(kind, errandId: errandId, payload: payload);
      return true;
    } on Object {
      return false;
    }
  }

  Future<JobActionResult> _failure(String errandId, Object e) async {
    if (RunnerJobsRepository.isAccessRevoked(e)) {
      revoke(errandId);
      return const JobActionResult.failed(ActiveJobsCopy.revoked);
    }
    if (e is NitumeApiException) {
      if (e.code == ApiErrorCodes.illegalTransition) {
        await load();
        return const JobActionResult.failed(ActiveJobsCopy.changed);
      }
      if (e.code == ApiErrorCodes.evidenceRequired) {
        final missing = e.missingEvidence ?? const [];
        return JobActionResult.failed(
          missing.contains(EvidenceType.photo) || missing.isEmpty
              ? ActiveJobsCopy.photosMissing
              : ActiveJobsCopy.receiptMissing,
        );
      }
    }
    return JobActionResult.failed(friendlyError(e));
  }

  /// `OfflineActionQueue.onDropped`: reload, then tell the runner once.
  void onQueueDropped(QueuedAction action, QueueDropReason reason) {
    unawaited(() async {
      _optimisticStatus.remove(action.errandId);
      if (action.kind == QueuedActionKind.runnerNotes) {
        _optimisticNotes.remove(action.errandId);
      }
      await load();
      final String message;
      if (action.kind == QueuedActionKind.evidenceUpload) {
        message = reason == QueueDropReason.fileMissing
            ? ActiveJobsCopy.photoGone
            : ActiveJobsCopy.photoRefused;
      } else {
        final job = byId(action.errandId);
        final label = job == null
            ? null
            : runnerStatusPresentation(job.status)?.label;
        message = label == null
            ? ActiveJobsCopy.revoked
            : ActiveJobsCopy.refusedReplay(label.toLowerCase());
      }
      _notice = message;
      notifyListeners();
    }());
  }

  /// Log out: forget everything and stop pings.
  void reset() {
    _held = const [];
    _loaded = false;
    _error = null;
    _notice = null;
    _optimisticStatus.clear();
    _optimisticNotes.clear();
    _priceDecided.clear();
    live.syncRooms(const []);
    uploads.releaseAll();
    pings.reset();
    notifyListeners();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
