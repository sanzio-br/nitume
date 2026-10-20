import 'dart:io';

import 'package:nitume_core/nitume_core.dart';
import 'package:path_provider/path_provider.dart';

import 'backup_exclusion.dart';

/// R-22 / R-21 evidence store on a device (row 149): a
/// [DirectoryEvidenceFileStore] in the app-support directory
/// (`getApplicationSupportDirectory`), folder `nitume_evidence`.
///
/// That directory is app-private: not the photo library, not shared
/// storage, and not a cache the OS clears, so a photo can wait offline in
/// the R-21 queue. B-1 rules stay with the callers: `EvidenceUploader`
/// discards the picker file once kept and deletes the kept copy on upload,
/// remove and release; `RunnerQueuedActions.cleanupFor(store)` deletes
/// queued copies when they leave the queue; at log out call
/// `queue.clear()` then [DirectoryEvidenceFileStore.discardAll]; at start,
/// after `queue.load()`, call
/// `discardExcept(RunnerQueuedActions.evidencePaths(queue.pending))`. That
/// never deletes a copy this store kept in the current run, so capture need
/// not wait for it; create one store per app run and share it.
///
/// After log out the cleared queue refuses new work until its next
/// `load()`, and a released uploader never queues, so no photo is persisted
/// for the next session.
///
/// Backups (owner row 255): the folder is excluded from device backups
/// whenever the store creates it (and once per run for an existing one).
/// On iOS through [BackupExclusion] (`NSURLIsExcludedFromBackupKey`); on
/// Android the runner app's manifest backup rules exclude
/// `nitume_evidence` in the `file` domain (the app-support directory is
/// `Context.getFilesDir()` there).
///
/// [directory] overrides the base directory and [excludeFromBackup] the
/// exclusion (tests).
DirectoryEvidenceFileStore appSupportEvidenceFileStore({
  Future<Directory> Function()? directory,
  Future<void> Function(Directory folder)? excludeFromBackup,
}) => DirectoryEvidenceFileStore(
  directory ?? getApplicationSupportDirectory,
  onFolderReady: excludeFromBackup ?? BackupExclusion.exclude,
);
