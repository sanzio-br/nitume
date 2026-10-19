import 'dart:io';
import 'dart:typed_data';

/// Reads a captured image into memory.
///
/// The screens then call `CapturedImage.discard`, which deletes the capture
/// file and any scratch copy the picker made (B-1), and the app calls
/// `ImagePickerCaptureSource.discardLostCaptures` once at startup for
/// captures orphaned when Android killed the app mid-pick. After that the
/// app keeps no capture file of its own; copies outside the app (the
/// runner's own gallery photo, the system camera app) are not the app's to
/// delete.
abstract interface class CaptureFiles {
  Future<Uint8List> read(String path);
}

/// [CaptureFiles] on `dart:io`.
class IoCaptureFiles implements CaptureFiles {
  const IoCaptureFiles();

  @override
  Future<Uint8List> read(String path) => File(path).readAsBytes();
}
