import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:nitume_core/nitume_core.dart';

/// [ImageCaptureSource] on `image_picker` (owner row 124).
///
/// Camera captures are compressed by the plugin: long edge ≤ [maxEdge] px,
/// JPEG quality [quality] (`_shared.md` R-22: 1600 px, 80). The plugin
/// deletes its full-size camera file once the scaled one is written.
/// [CaptureFrom.frontCamera] asks for the front lens (selfie).
///
/// Gallery picks are **not** resized (reviewer B-1). On Android the plugin
/// copies a gallery photo into `cacheDir/<uuid>/` and, when asked to resize,
/// writes a scaled file elsewhere and never deletes that full-resolution
/// copy, so a runner's ID would stay in the app cache. Without resizing the
/// copy is the returned file itself, and [CapturedImage.discard] deletes it
/// with its `<uuid>` directory. The screens' 10 MB check (row 163) covers
/// large gallery photos.
///
/// Callers must call [CapturedImage.discard] once the bytes are read, and
/// [discardLostCaptures] at startup: after which no capture file is left on
/// the device.
class ImagePickerCaptureSource implements ImageCaptureSource {
  ImagePickerCaptureSource({
    ImagePicker? picker,
    this.maxEdge = 1600,
    this.quality = 80,
    bool? isAndroid,
  }) : _picker = picker ?? ImagePicker(),
       _isAndroid = isAndroid ?? Platform.isAndroid;

  final ImagePicker _picker;
  final double maxEdge;
  final int quality;
  final bool _isAndroid;

  @override
  Future<CapturedImage?> takePhoto({
    CaptureFrom from = CaptureFrom.camera,
  }) async {
    final gallery = from == CaptureFrom.gallery;
    final file = await _picker.pickImage(
      source: gallery ? ImageSource.gallery : ImageSource.camera,
      maxWidth: gallery ? null : maxEdge,
      maxHeight: gallery ? null : maxEdge,
      imageQuality: gallery ? null : quality,
      requestFullMetadata: false,
      preferredCameraDevice: from == CaptureFrom.frontCamera
          ? CameraDevice.front
          : CameraDevice.rear,
    );
    if (file == null) return null;
    return _captured(file);
  }

  /// Android only: deletes photos the plugin kept for an activity that the
  /// system killed while the camera or gallery was open (the
  /// `retrieveLostData` cache), so they never linger. The capture is not
  /// restored: the runner takes it again. Call once at app startup. Returns
  /// how many photos were deleted; 0 on other platforms.
  Future<int> discardLostCaptures() async {
    if (!_isAndroid) return 0;
    final LostDataResponse lost;
    try {
      lost = await _picker.retrieveLostData();
    } on UnimplementedError {
      return 0;
    }
    final files = lost.files ?? const <XFile>[];
    for (final f in files) {
      await (await _captured(f)).discard();
    }
    return files.length;
  }

  Future<CapturedImage> _captured(XFile file) async => CapturedImage(
    path: file.path,
    contentType: await contentTypeOf(file),
    scratchDirectory: scratchDirectoryOf(file.path),
  );

  static final _uuidDir = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// The `<uuid>` directory image_picker on Android creates for one gallery
  /// copy (`cacheDir/<uuid>/<name>`), or `null` when [path] is not in one.
  static String? scratchDirectoryOf(String path) {
    final parent = File(path).parent;
    final name = parent.uri.pathSegments.where((s) => s.isNotEmpty).lastOrNull;
    return name != null && _uuidDir.hasMatch(name) ? parent.path : null;
  }

  /// MIME type from the file's first bytes (JPEG, PNG, WebP, HEIC/HEIF),
  /// then the plugin's [XFile.mimeType], then the extension; `image/jpeg`
  /// only when nothing else is known (reviewer minor 4).
  static Future<String> contentTypeOf(XFile file) async {
    var head = <int>[];
    try {
      await for (final chunk in file.openRead(0, 16)) {
        head.addAll(chunk);
      }
    } on Object {
      head = <int>[];
    }
    return sniffImageType(head) ??
        _imageMime(file.mimeType) ??
        _byExtension(file.path) ??
        'image/jpeg';
  }

  /// MIME type from magic bytes, `null` when not a known image type.
  static String? sniffImageType(List<int> b) {
    bool at(int offset, List<int> sig) {
      if (b.length < offset + sig.length) return false;
      for (var i = 0; i < sig.length; i++) {
        if (b[offset + i] != sig[i]) return false;
      }
      return true;
    }

    if (at(0, const [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
    if (at(0, const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
      return 'image/png';
    }
    if (at(0, 'RIFF'.codeUnits) && at(8, 'WEBP'.codeUnits)) {
      return 'image/webp';
    }
    if (at(4, 'ftyp'.codeUnits) && b.length >= 12) {
      final brand = String.fromCharCodes(b.sublist(8, 12));
      if (const {'heic', 'heix', 'hevc', 'hevx'}.contains(brand)) {
        return 'image/heic';
      }
      if (const {'mif1', 'msf1', 'heim', 'heis'}.contains(brand)) {
        return 'image/heif';
      }
    }
    return null;
  }

  static String? _imageMime(String? m) =>
      m != null && m.startsWith('image/') ? m : null;

  static String? _byExtension(String path) {
    final dot = path.lastIndexOf('.');
    if (dot < 0) return null;
    return switch (path.substring(dot + 1).toLowerCase()) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'heic' => 'image/heic',
      'heif' => 'image/heif',
      _ => null,
    };
  }
}
