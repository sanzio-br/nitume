import 'dart:io';
import 'dart:typed_data';

/// Reads and deletes a captured image in app storage. ID and selfie photos
/// are read into memory and the file is deleted at once, so nothing stays on
/// the device after the upload (`v-onboard-id` Accessibility and mobile).
abstract interface class CaptureFiles {
  Future<Uint8List> read(String path);

  /// Best effort; never throws.
  Future<void> delete(String path);
}

/// [CaptureFiles] on `dart:io`.
class IoCaptureFiles implements CaptureFiles {
  const IoCaptureFiles();

  @override
  Future<Uint8List> read(String path) => File(path).readAsBytes();

  @override
  Future<void> delete(String path) async {
    try {
      await File(path).delete();
    } on Object {
      // Already gone or not ours to delete.
    }
  }
}
