import 'package:image_picker/image_picker.dart';
import 'package:nitume_core/nitume_core.dart';

/// [ImageCaptureSource] on `image_picker` (owner row 124), compressing on
/// capture: long edge ≤ [maxEdge] px, JPEG quality [quality] (`_shared.md`
/// R-22: 1600 px, 80).
class ImagePickerCaptureSource implements ImageCaptureSource {
  ImagePickerCaptureSource({
    ImagePicker? picker,
    this.maxEdge = 1600,
    this.quality = 80,
  }) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;
  final double maxEdge;
  final int quality;

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    final file = await _picker.pickImage(
      source: from == CaptureFrom.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: maxEdge,
      maxHeight: maxEdge,
      imageQuality: quality,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    return CapturedImage(
      path: file.path,
      contentType: file.mimeType ?? 'image/jpeg',
    );
  }
}
