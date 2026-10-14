import 'dart:io';
import 'dart:typed_data';

import '../api/api_exception.dart';
import '../models/enums.dart';
import '../repositories/runner_repositories.dart';
import 'evidence_file_store.dart';
import 'offline_action_queue.dart';

/// Payload helpers and the replay runner for the runner app's queued
/// actions (R-21 over R-19).
abstract final class RunnerQueuedActions {
  /// Payload for a queued runner transition.
  static Map<String, Object?> transition({
    required ErrandStatus from,
    required ErrandStatus to,
    String? note,
  }) => {'from': from.wire, 'to': to.wire, 'note': ?note};

  /// Payload for queued runner notes (`null` clears them).
  static Map<String, Object?> runnerNotes(String? notes) => {
    'runnerNotes': notes,
  };

  /// Payload for a queued evidence upload. [path] is the compressed photo
  /// kept in app storage ([EvidenceFileStore.keep]); the queue's
  /// [cleanupFor] hook deletes it once the action leaves the queue.
  static Map<String, Object?> evidence({
    required String path,
    required EvidenceType type,
    required String contentType,
    DateTime? capturedAt,
    double? lat,
    double? lon,
  }) => {
    'path': path,
    'type': type.wire,
    'contentType': contentType,
    'capturedAt': ?capturedAt?.toUtc().toIso8601String(),
    'lat': ?lat,
    'lon': ?lon,
  };

  /// An `OfflineActionQueue.onSettled` hook that deletes the kept photo of
  /// an evidence action once it leaves the queue (uploaded, refused,
  /// superseded or cleared).
  static Future<void> Function(QueuedAction action) cleanupFor(
    EvidenceFileStore files,
  ) => (action) async {
    if (action.kind != QueuedActionKind.evidenceUpload) return;
    final path = action.payload['path'];
    if (path is String) await files.discard(path);
  };

  /// A [QueuedActionRunner] that replays through [repo]. A missing photo
  /// file answers [ReplayOutcome.fileMissing] (reported to the runner).
  ///
  /// A replayed transition answered 409 counts as done when the job is
  /// already in the target state (the API has no idempotent replay yet,
  /// RA-17); otherwise it is rejected.
  static QueuedActionRunner runnerFor(
    RunnerJobsRepository repo, {
    Future<Uint8List> Function(String path)? readFile,
  }) {
    final read = readFile ?? (String p) => File(p).readAsBytes();
    return (action) async {
      final p = action.payload;
      try {
        switch (action.kind) {
          case QueuedActionKind.statusTransition:
            final to = ErrandStatus.fromWire(p['to']! as String);
            try {
              await repo.transition(
                action.errandId,
                from: ErrandStatus.fromWire(p['from']! as String),
                to: to,
                note: p['note'] as String?,
              );
            } on NitumeApiException catch (e) {
              if (e.statusCode != 409) rethrow;
              final job = await repo.get(action.errandId);
              return job.status == to
                  ? ReplayOutcome.done
                  : ReplayOutcome.rejected;
            }
          case QueuedActionKind.runnerNotes:
            await repo.updateRunnerNotes(
              action.errandId,
              p['runnerNotes'] as String?,
            );
          case QueuedActionKind.evidenceUpload:
            final bytes = await read(p['path']! as String);
            await repo.uploadEvidence(
              action.errandId,
              type: EvidenceType.fromWire(p['type']! as String),
              bytes: bytes,
              contentType: p['contentType']! as String,
              capturedAt: DateTime.tryParse('${p['capturedAt']}'),
              lat: (p['lat'] as num?)?.toDouble(),
              lon: (p['lon'] as num?)?.toDouble(),
            );
        }
        return ReplayOutcome.done;
      } on Object catch (e) {
        return replayOutcomeFor(e);
      }
    };
  }
}
