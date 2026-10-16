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
/// cache (the application-support directory). Getting that directory on a
/// device needs `path_provider` (pending owner approval); tests pass a temp
/// directory.
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
