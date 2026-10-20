import 'package:flutter/foundation.dart';

import 'evidence_uploader.dart';

/// R-22 lifetime (C-V2): one [EvidenceUploader] per held job, owned at app
/// scope (next to the session), so an upload in flight survives leaving
/// `v-evidence-capture` and `v-active` can read the item states.
///
/// * `v-evidence-capture` captures through `forJob(errandId)` and passes the
///   same `errandId` to [EvidenceUploader.captureAndUpload].
/// * `v-active` reads `existing(errandId)?.items` (and listens to this
///   object, which notifies when an uploader is created or released).
/// * Release a job's uploader when the job leaves the active set and its
///   24 h receipt window ([release], or [retainOnly] with the held-job ids
///   after each reload). Call [releaseAll] at log out.
///
/// Releasing disposes the uploader: failed copies are deleted, and uploads
/// still in flight run to the end and clean up after themselves (see
/// [EvidenceUploader.dispose]). Queued uploads stay with the R-21 queue.
class JobEvidenceUploads extends ChangeNotifier {
  JobEvidenceUploads(this._create);

  /// Builds the uploader for one job (capture source, upload call, file
  /// store, positions and queue of the session).
  final EvidenceUploader Function(String errandId) _create;
  final Map<String, EvidenceUploader> _byJob = {};
  bool _disposed = false;

  /// Jobs that have an uploader now.
  Set<String> get jobIds => Set.unmodifiable(_byJob.keys);

  /// The job's uploader, created on first use.
  EvidenceUploader forJob(String errandId) {
    if (_disposed) throw StateError('JobEvidenceUploads was disposed');
    final current = _byJob[errandId];
    if (current != null) return current;
    final created = _create(errandId);
    _byJob[errandId] = created;
    notifyListeners();
    return created;
  }

  /// The job's uploader if one exists (never creates one).
  EvidenceUploader? existing(String errandId) => _byJob[errandId];

  /// Releases (disposes) the job's uploader, if any.
  void release(String errandId) {
    final u = _byJob.remove(errandId);
    if (u == null) return;
    u.dispose();
    if (!_disposed) notifyListeners();
  }

  /// Releases every uploader whose job is not in [errandIds].
  void retainOnly(Iterable<String> errandIds) {
    final keep = errandIds.toSet();
    final drop = _byJob.keys.where((id) => !keep.contains(id)).toList();
    if (drop.isEmpty) return;
    for (final id in drop) {
      _byJob.remove(id)!.dispose();
    }
    if (!_disposed) notifyListeners();
  }

  /// Releases every uploader (log out).
  void releaseAll() => retainOnly(const []);

  @override
  void dispose() {
    _disposed = true;
    releaseAll();
    super.dispose();
  }
}
