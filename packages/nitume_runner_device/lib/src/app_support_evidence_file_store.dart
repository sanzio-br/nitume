import 'dart:io';

import 'package:nitume_core/nitume_core.dart';
import 'package:path_provider/path_provider.dart';

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
/// `discardExcept(RunnerQueuedActions.evidencePaths(queue.pending))`.
///
/// [directory] overrides the base directory (tests).
DirectoryEvidenceFileStore appSupportEvidenceFileStore({
  Future<Directory> Function()? directory,
}) => DirectoryEvidenceFileStore(directory ?? getApplicationSupportDirectory);
