import 'dart:io';

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
class DirectoryEvidenceFileStore implements EvidenceFileStore {
  DirectoryEvidenceFileStore(this.directory, {this.folder = 'nitume_evidence'});

  final Future<Directory> Function() directory;
  final String folder;
  int _seq = 0;

  Future<Directory> _root() async {
    final base = await directory();
    final dir = Directory('${base.path}${Platform.pathSeparator}$folder');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  @override
  Future<String> keep(String sourcePath) async {
    final dir = await _root();
    final name = sourcePath.split(RegExp(r'[\\/]')).last;
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final target =
        '${dir.path}${Platform.pathSeparator}${stamp}_${_seq++}_$name';
    await File(sourcePath).copy(target);
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

  /// Deletes every kept file (log out). Missing files are ignored.
  Future<void> discardAll() => discardExcept(const []);

  /// Deletes every kept file whose path is not in [keep] (start-up: keep the
  /// paths the offline queue still holds).
  Future<void> discardExcept(Iterable<String> keep) async {
    final wanted = {for (final p in keep) File(p).absolute.path};
    for (final path in await keptPaths()) {
      if (wanted.contains(File(path).absolute.path)) continue;
      await discard(path);
    }
  }

  @override
  Future<void> discard(String path) async {
    final dir = await _root();
    // Only ever delete inside our own folder.
    if (!File(path).absolute.path.startsWith(dir.absolute.path)) return;
    try {
      await File(path).delete();
    } on FileSystemException {
      // Already gone.
    }
  }
}
