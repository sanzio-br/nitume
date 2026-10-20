import 'dart:io';

import 'package:path/path.dart' as p;

/// Keeps captured evidence photos in app storage until they are sent.
///
/// image_picker returns files in a cache/temp directory that the OS may
/// clear, so a capture is copied here before it is uploaded or queued and
/// deleted once it is uploaded or finally refused (R-22, R-21).
abstract interface class EvidenceFileStore {
  /// Copies [sourcePath] into app storage and returns the new path.
  /// Throws [FileSystemException] when the source is missing.
  Future<String> keep(String sourcePath);

  /// Deletes a kept file; missing files are ignored.
  Future<void> discard(String path);
}

/// [EvidenceFileStore] in a sub-folder of [directory].
///
/// [directory] should be app-private storage that is not cleared like a
/// cache (the application-support directory): on a device use
/// `appSupportEvidenceFileStore()` from `package:nitume_runner_device`
/// (`path_provider`, row 149); tests pass a temp directory.
///
/// Cleanup beside the per-file [discard] (B-1): [discardAll] at log out,
/// after the queue is cleared; [discardExcept] at start, with the paths the
/// loaded offline queue still holds, for copies left by a killed app.
/// [discardExcept] never deletes a copy this instance kept in the current
/// run, so a photo captured while the start-up clean-up runs is safe; use
/// one instance per app run, shared by the uploaders and the queue.
///
/// [onFolderReady] runs on the folder the first time this instance uses it
/// in a run, right after creating it when it is missing, and again whenever
/// it had to be re-created. The device store uses it to exclude the folder
/// from device backups (owner row 255). It never blocks a capture: an
/// error is swallowed and the hook is retried on the next use.
class DirectoryEvidenceFileStore implements EvidenceFileStore {
  DirectoryEvidenceFileStore(
    this.directory, {
    this.folder = 'nitume_evidence',
    this.onFolderReady,
  });

  final Future<Directory> Function() directory;
  final String folder;
  final Future<void> Function(Directory folder)? onFolderReady;
  int _seq = 0;
  bool _folderReady = false;

  /// Copies kept by this instance in this run (normalised paths).
  final _keptThisRun = <String>{};

  Future<Directory> _root() async {
    final base = await directory();
    final dir = Directory('${base.path}${Platform.pathSeparator}$folder');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
      _folderReady = false;
    }
    final hook = onFolderReady;
    if (hook != null && !_folderReady) {
      try {
        await hook(dir);
        _folderReady = true;
      } on Object {
        // Retried on the next use; a capture is never blocked by it.
      }
    }
    return dir;
  }

  @override
  Future<String> keep(String sourcePath) async {
    final dir = await _root();
    final name = sourcePath.split(RegExp(r'[\\/]')).last;
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final target =
        '${dir.path}${Platform.pathSeparator}${stamp}_${_seq++}_$name';
    // Registered before the copy exists, so a concurrent discardExcept can
    // never see it unprotected.
    final key = _normal(target);
    _keptThisRun.add(key);
    try {
      await File(sourcePath).copy(target);
    } on Object {
      _keptThisRun.remove(key);
      rethrow;
    }
    return target;
  }

  /// Every kept file, oldest name first. Empty when the folder does not
  /// exist yet.
  Future<List<String>> keptPaths() async {
    final dir = await _root();
    final files = [
      for (final e in await dir.list().toList())
        if (e is File) e.path,
    ]..sort();
    return files;
  }

  /// Deletes every kept file (log out), also those kept in this run.
  /// Missing files are ignored.
  Future<void> discardAll() async {
    for (final path in await keptPaths()) {
      await discard(path);
    }
  }

  /// Start-up clean-up of copies left by an earlier run: deletes every kept
  /// file whose path is not in [keep] (the paths the offline queue still
  /// holds) and that this instance did not keep in the current run.
  Future<void> discardExcept(Iterable<String> keep) async {
    final wanted = {for (final k in keep) _normal(k)};
    for (final path in await keptPaths()) {
      final key = _normal(path);
      // Checked right before each delete: a capture kept meanwhile is safe.
      if (wanted.contains(key) || _keptThisRun.contains(key)) continue;
      await discard(path);
    }
  }

  /// Deletes [path] only when it is a file directly inside the store
  /// folder; any other path (outside it, `..` segments that leave it, a
  /// sibling folder sharing its name as a prefix, a sub-folder or a symlinked
  /// folder) is ignored. [discardAll] and [discardExcept] go through here.
  @override
  Future<void> discard(String path) async {
    final dir = await _root();
    if (!await _isDirectChild(path, dir)) return;
    _keptThisRun.remove(_normal(path));
    try {
      await File(path).delete();
    } on FileSystemException {
      // Already gone.
    }
  }

  static String _normal(String path) => p.normalize(File(path).absolute.path);

  /// True when [path], normalised (`..` resolved), names an entry whose
  /// parent folder is [root] once symlinks are resolved on both sides.
  static Future<bool> _isDirectChild(String path, Directory root) async {
    if (path.trim().isEmpty) return false;
    final normal = _normal(path);
    final name = p.basename(normal);
    if (name.isEmpty || name == '.' || name == '..') return false;
    final parent = Directory(p.dirname(normal));
    if (!await parent.exists()) return false;
    try {
      final rootReal = p.canonicalize(await root.resolveSymbolicLinks());
      final parentReal = p.canonicalize(await parent.resolveSymbolicLinks());
      return parentReal == rootReal;
    } on FileSystemException {
      return false;
    }
  }
}
