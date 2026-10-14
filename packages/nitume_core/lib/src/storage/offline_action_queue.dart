import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';
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

  /// Still offline: keep it and stop this replay (order is preserved).
  retryLater,

  /// The server refused it (e.g. 409, the job moved on): remove it and
  /// report through `onRejected` so the screen reloads the server state.
  rejected,
}

/// Maps a replay failure to an outcome: network errors retry later,
/// anything else is a server refusal.
ReplayOutcome replayOutcomeFor(Object error) =>
    error is NitumeApiException && error.isNetworkError
    ? ReplayOutcome.retryLater
    : ReplayOutcome.rejected;

/// Runs one queued action against the API.
typedef QueuedActionRunner = Future<ReplayOutcome> Function(
  QueuedAction action,
);

/// R-21. Persists runner actions made without connectivity and replays them
/// in order on reconnect (§7.2).
///
/// The screen shows the target state at once with the offline notice and
/// calls [replay] when the connection returns; a [ReplayOutcome.rejected]
/// action is dropped and passed to [onRejected] so the screen reloads and
/// never shows a later state than the server confirms.
class OfflineActionQueue extends ChangeNotifier {
  OfflineActionQueue({
    required this.store,
    required this.runner,
    this.onRejected,
    String Function()? newId,
    DateTime Function()? clock,
  }) : _newId = newId ?? PaymentsRepository.newIdempotencyKey,
       _clock = clock ?? DateTime.now;

  final QueueStore store;
  final QueuedActionRunner runner;
  final void Function(QueuedAction action)? onRejected;
  final String Function() _newId;
  final DateTime Function() _clock;

  List<QueuedAction> _pending = [];
  bool _replaying = false;

  /// Oldest first.
  List<QueuedAction> get pending => List.unmodifiable(_pending);
  bool get isEmpty => _pending.isEmpty;
  bool get replaying => _replaying;

  /// Pending actions for one errand.
  List<QueuedAction> pendingFor(String errandId) =>
      _pending.where((a) => a.errandId == errandId).toList();

  /// Reads the persisted queue (call once on start).
  Future<void> load() async {
    _pending = [for (final raw in await store.read()) ?_decode(raw)];
    notifyListeners();
  }

  static QueuedAction? _decode(String raw) {
    try {
      return QueuedAction.tryFromJson(jsonDecode(raw));
    } on FormatException {
      return null;
    }
  }

  /// Appends an action and persists it before returning.
  Future<QueuedAction> enqueue(
    QueuedActionKind kind, {
    required String errandId,
    required Map<String, Object?> payload,
  }) async {
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
  /// repeatedly; overlapping calls are ignored.
  Future<void> replay() async {
    if (_replaying) return;
    _replaying = true;
    notifyListeners();
    try {
      while (_pending.isNotEmpty) {
        final action = _pending.first;
        ReplayOutcome outcome;
        try {
          outcome = await runner(action);
        } on Object catch (e) {
          outcome = replayOutcomeFor(e);
        }
        if (outcome == ReplayOutcome.retryLater) {
          _pending = [action._retried(), ..._pending.skip(1)];
          await _persist();
          break;
        }
        _pending = _pending.skip(1).toList();
        await _persist();
        if (outcome == ReplayOutcome.rejected) onRejected?.call(action);
      }
    } finally {
      _replaying = false;
      notifyListeners();
    }
  }

  /// Drops everything (log out).
  Future<void> clear() async {
    _pending = [];
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() =>
      store.write([for (final a in _pending) jsonEncode(a.toJson())]);
}
