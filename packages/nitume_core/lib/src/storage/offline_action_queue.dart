import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';
import '../api/runner_error_details.dart';
import '../repositories/payments_repository.dart';

/// What a queued runner action does (§7.2: status transitions and evidence
/// made without connectivity; runner notes too).
enum QueuedActionKind {
  statusTransition('status_transition'),
  runnerNotes('runner_notes'),
  evidenceUpload('evidence_upload');

  const QueuedActionKind(this.wire);
  final String wire;

  static QueuedActionKind? tryFromWire(String? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// One persisted action. [id] doubles as the action's idempotency key for
/// the API once replays accept one (RA-17).
@immutable
class QueuedAction {
  const QueuedAction({
    required this.id,
    required this.kind,
    required this.errandId,
    required this.payload,
    required this.createdAt,
    this.attempts = 0,
  });

  final String id;
  final QueuedActionKind kind;
  final String errandId;

  /// JSON-safe arguments (no image bytes: evidence carries a local file
  /// path).
  final Map<String, Object?> payload;
  final DateTime createdAt;
  final int attempts;

  QueuedAction _retried() => QueuedAction(
    id: id,
    kind: kind,
    errandId: errandId,
    payload: payload,
    createdAt: createdAt,
    attempts: attempts + 1,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'kind': kind.wire,
    'errandId': errandId,
    'payload': payload,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'attempts': attempts,
  };

  /// `null` for an unreadable entry (dropped on load).
  static QueuedAction? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final kind = QueuedActionKind.tryFromWire(json['kind'] as String?);
    final id = json['id'];
    final errandId = json['errandId'];
    final payload = json['payload'];
    final createdAt = DateTime.tryParse('${json['createdAt']}');
    if (kind == null ||
        id is! String ||
        errandId is! String ||
        payload is! Map ||
        createdAt == null) {
      return null;
    }
    return QueuedAction(
      id: id,
      kind: kind,
      errandId: errandId,
      payload: payload.cast<String, Object?>(),
      createdAt: createdAt,
      attempts: (json['attempts'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Where the queue is persisted. The runner app uses
/// `SharedPreferencesQueueStore` from `package:nitume_runner_device`.
abstract interface class QueueStore {
  Future<List<String>> read();
  Future<void> write(List<String> entries);
}

/// In-memory [QueueStore] for tests.
class InMemoryQueueStore implements QueueStore {
  List<String> entries = [];

  @override
  Future<List<String>> read() async => List.of(entries);

  @override
  Future<void> write(List<String> entries) async =>
      this.entries = List.of(entries);
}

/// Result of replaying one action.
enum ReplayOutcome {
  /// The server accepted it: remove from the queue.
  done,

  /// Not sent (offline, timeout, 5xx, 408, 429, 401 before re-auth): keep
  /// it and stop this replay, so order is preserved.
  retryLater,

  /// The server refused it for good (e.g. 403, 409 after re-check, 422):
  /// remove it and report it so the screen reloads the server state.
  rejected,

  /// The queued photo is no longer on the phone: remove it and tell the
  /// runner to take it again.
  fileMissing,

  /// The photo is above the server's size limit (413
  /// [ApiErrorCodes.evidenceTooLarge], row 252). Permanent: remove it (its
  /// file is deleted by `onSettled`) and tell the runner to take it again.
  tooLarge,
}

/// Why an action left the queue without being applied.
enum QueueDropReason {
  /// The server refused it ([ReplayOutcome.rejected]).
  refused,

  /// Its local photo file is gone ([ReplayOutcome.fileMissing]).
  fileMissing,

  /// An earlier status change for the same errand was refused, so this
  /// later one no longer applies.
  superseded,

  /// Its photo is above the server's size limit ([ReplayOutcome.tooLarge],
  /// row 252); show `RunnerEvidenceCopy.tooLarge`.
  tooLarge,
}

/// Maps a replay failure to an outcome. Transport problems and temporary
/// server answers (including 409 [ApiErrorCodes.idempotencyInProgress])
/// retry later; only real refusals drop the action.
///
/// A 413 [ApiErrorCodes.evidenceTooLarge] is [ReplayOutcome.tooLarge]. A
/// 413 without a code (a proxy or an older API) is too large only when
/// [kind] is [QueuedActionKind.evidenceUpload]; for any other (or unknown)
/// kind it is a plain refusal ([ReplayOutcome.rejected]).
ReplayOutcome replayOutcomeFor(Object error, {QueuedActionKind? kind}) {
  if (error is NitumeApiException) {
    if (error.isNetworkError) return ReplayOutcome.retryLater;
    if (error.code == ApiErrorCodes.idempotencyInProgress) {
      return ReplayOutcome.retryLater;
    }
    // Row 252: the same file never fits; never retried.
    final big = EvidenceTooLarge.of(
      error,
      bare413: kind == QueuedActionKind.evidenceUpload,
    );
    if (big != null) return ReplayOutcome.tooLarge;
    final status = error.statusCode;
    if (status == null ||
        status == 401 ||
        status == 408 ||
        status == 429 ||
        status >= 500) {
      return ReplayOutcome.retryLater;
    }
    return ReplayOutcome.rejected;
  }
  if (error is TimeoutException ||
      error is SocketException ||
      error is HttpException) {
    return ReplayOutcome.retryLater;
  }
  if (error is FileSystemException) return ReplayOutcome.fileMissing;
  return ReplayOutcome.rejected;
}

/// Runs one queued action against the API.
typedef QueuedActionRunner = Future<ReplayOutcome> Function(
  QueuedAction action,
);

/// R-21. Persists runner actions made without connectivity and replays them
/// in order on reconnect (§7.2).
///
/// The screen shows the target state at once with the offline notice and
/// calls [replay] when the connection returns.
///
/// * Temporary failures keep the action and stop the replay (order kept).
/// * A refused, file-missing or too-large action is dropped and passed to
///   [onDropped]
///   so the screen reloads and tells the runner; a refused status change
///   also drops the later queued status changes of the same errand
///   ([QueueDropReason.superseded]).
/// * [onSettled] runs for every action that leaves the queue (applied,
///   dropped or cleared): use it to delete queued photo files
///   (`RunnerQueuedActions.cleanupFor`).
/// * Writes to [store] are serialised in call order.
class OfflineActionQueue extends ChangeNotifier {
  OfflineActionQueue({
    required this.store,
    required this.runner,
    this.onDropped,
    this.onSettled,
    String Function()? newId,
    DateTime Function()? clock,
  }) : _newId = newId ?? PaymentsRepository.newIdempotencyKey,
       _clock = clock ?? DateTime.now;

  final QueueStore store;
  final QueuedActionRunner runner;
  final void Function(QueuedAction action, QueueDropReason reason)? onDropped;
  final Future<void> Function(QueuedAction action)? onSettled;
  final String Function() _newId;
  final DateTime Function() _clock;

  List<QueuedAction> _pending = [];
  bool _replaying = false;
  int _generation = 0;
  bool _closed = false;

  /// Whether the store was read since the start or the last [clear]. Until
  /// then [enqueue] reads it first, so it never writes over actions that
  /// were persisted but not read yet.
  bool _read = false;
  Future<void>? _loading;

  /// True after [clear], or after a [load] whose store read failed, until
  /// the next good [load]: [enqueue] refuses new work. Log out must not
  /// leave anything persisted for the next session, and an unread store
  /// must never be written over (its earlier actions would be lost).
  ///
  /// False while a [load] is in flight: [enqueue] then waits for it.
  bool get isClosed => _closed && _loading == null;
  Future<void> _writes = Future.value();

  /// Oldest first.
  List<QueuedAction> get pending => List.unmodifiable(_pending);
  bool get isEmpty => _pending.isEmpty;
  bool get replaying => _replaying;

  /// Pending actions for one errand.
  List<QueuedAction> pendingFor(String errandId) =>
      _pending.where((a) => a.errandId == errandId).toList();

  /// Reads the persisted queue (call once on start, and at each sign-in
  /// after a [clear]) and opens the queue.
  ///
  /// The queue opens only after a good read. When [QueueStore.read] throws,
  /// the error is rethrown and the queue stays (or becomes) closed
  /// ([isClosed]): [enqueue] then throws [StateError], so the caller fails
  /// the action with a retry instead of queueing it over the unread store.
  /// Call [load] again later to open it. A [clear] during the read wins:
  /// the queue stays closed and the read is ignored. Overlapping calls
  /// share one read.
  Future<void> load() =>
      _loading ??= _load().whenComplete(() => _loading = null);

  Future<void> _load() async {
    final generation = _generation;
    final List<String> raw;
    try {
      // Let queued writes land first, so the read sees them.
      await _writes.catchError((Object _) {});
      raw = await store.read();
    } on Object {
      _closed = true;
      notifyListeners();
      rethrow;
    }
    if (generation != _generation) return; // cleared meanwhile
    _pending = [for (final r in raw) ?_decode(r)];
    _read = true;
    _closed = false;
    notifyListeners();
  }

  static QueuedAction? _decode(String raw) {
    try {
      return QueuedAction.tryFromJson(jsonDecode(raw));
    } on FormatException {
      return null;
    }
  }

  /// Appends an action and persists it before returning. Waits for a
  /// [load] in flight, and reads the store first when it was never read.
  /// Throws [StateError] while the queue is closed (after [clear] or a
  /// failed read, until the next good [load]).
  Future<QueuedAction> enqueue(
    QueuedActionKind kind, {
    required String errandId,
    required Map<String, Object?> payload,
  }) async {
    final loading = _loading ?? (_read || _closed ? null : load());
    if (loading != null) {
      try {
        await loading;
      } on Object {
        // Read failed: the queue is closed, refused below.
      }
    }
    if (_closed) {
      throw StateError(
        'OfflineActionQueue is closed (cleared at log out, or its store '
        'could not be read)',
      );
    }
    final action = QueuedAction(
      id: _newId(),
      kind: kind,
      errandId: errandId,
      payload: payload,
      createdAt: _clock().toUtc(),
    );
    _pending = [..._pending, action];
    await _persist();
    notifyListeners();
    return action;
  }

  /// Replays pending actions in order until one must wait. Safe to call
  /// repeatedly; overlapping calls are ignored. A [clear] during a replay
  /// wins: nothing is re-added.
  Future<void> replay() async {
    if (_replaying) return;
    _replaying = true;
    notifyListeners();
    try {
      while (_pending.isNotEmpty) {
        final generation = _generation;
        final action = _pending.first;
        ReplayOutcome outcome;
        try {
          outcome = await runner(action);
        } on Object catch (e) {
          outcome = replayOutcomeFor(e, kind: action.kind);
        }
        if (generation != _generation) break; // cleared meanwhile
        if (outcome == ReplayOutcome.retryLater) {
          _pending = [
            for (final a in _pending) a.id == action.id ? a._retried() : a,
          ];
          await _persist();
          break;
        }
        final dropped = <(QueuedAction, QueueDropReason)>[];
        if (outcome != ReplayOutcome.done) {
          dropped.add((
            action,
            switch (outcome) {
              ReplayOutcome.fileMissing => QueueDropReason.fileMissing,
              ReplayOutcome.tooLarge => QueueDropReason.tooLarge,
              _ => QueueDropReason.refused,
            },
          ));
          if (outcome == ReplayOutcome.rejected &&
              action.kind == QueuedActionKind.statusTransition) {
            for (final a in _pending) {
              if (a.id != action.id &&
                  a.errandId == action.errandId &&
                  a.kind == QueuedActionKind.statusTransition) {
                dropped.add((a, QueueDropReason.superseded));
              }
            }
          }
        }
        final leaving = {action.id, for (final (a, _) in dropped) a.id};
        _pending = [
          for (final a in _pending)
            if (!leaving.contains(a.id)) a,
        ];
        await _persist();
        await _settle(action);
        for (final (a, reason) in dropped) {
          if (a.id != action.id) await _settle(a);
          onDropped?.call(a, reason);
        }
      }
    } finally {
      _replaying = false;
      notifyListeners();
    }
  }

  /// Drops everything (log out). Settles each dropped action and closes the
  /// queue until the next good [load] ([isClosed]).
  Future<void> clear() async {
    _closed = true;
    _read = false;
    _generation++;
    final dropped = _pending;
    _pending = [];
    await _persist();
    for (final a in dropped) {
      await _settle(a);
    }
    notifyListeners();
  }

  Future<void> _settle(QueuedAction action) async {
    final hook = onSettled;
    if (hook == null) return;
    try {
      await hook(action);
    } on Object {
      // Cleanup is best effort.
    }
  }

  /// Serialised: each write starts after the previous one finished.
  Future<void> _persist() {
    final snapshot = [for (final a in _pending) jsonEncode(a.toJson())];
    return _writes = _writes
        .catchError((Object _) {})
        .then((_) => store.write(snapshot));
  }
}
