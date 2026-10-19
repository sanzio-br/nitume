import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../util/display.dart';

/// A captured ID or selfie photo held in memory only. The capture files are
/// discarded as soon as the bytes are read.
class LocalPhoto {
  const LocalPhoto(this.bytes, this.contentType);

  final Uint8List bytes;
  final String contentType;

  ImageProvider get image => MemoryImage(bytes);
}

/// Why a capture could not be sent.
enum PhotoProblem {
  /// Above 10 MB (row 163), checked before upload or a 413.
  tooLarge,

  /// Not a JPEG, PNG, WebP or HEIC image.
  badType,

  /// Empty file, side refused or another fault with this photo.
  bad,
}

/// Onboarding capture copy (`v-onboard-id`, `v-onboard-selfie`).
abstract final class CaptureCopy {
  static const badType = 'Use a JPEG, PNG or HEIC photo.';
  static const badPhoto = 'Something went wrong with this photo. Try again.';
  static const tooLargeLead = 'This photo is larger than ';
  static const tooLargeSize = '10 MB';
  static const tooLargeIdTail = '. Take it again or choose a smaller photo.';
  static const tooLargeSelfieTail = '. Take it again.';
}

/// `This photo is larger than 10 MB. …` with `10 MB` in Fira Code.
NitumeNotice tooLargeNotice({required String tail}) => NitumeNotice(
  message: '${CaptureCopy.tooLargeLead}${CaptureCopy.tooLargeSize}$tail',
  richMessage: TextSpan(
    children: [
      const TextSpan(text: CaptureCopy.tooLargeLead),
      const NumSpan(CaptureCopy.tooLargeSize),
      TextSpan(text: tail),
    ],
  ),
);

/// Captures one photo from [from], reads it into memory and discards the
/// capture (the file and any scratch copy the picker made, B-1). Returns
/// `null` when the runner cancelled. Throws [PhotoProblem]
/// when the photo cannot be sent (checked before any upload, row 163).
Future<LocalPhoto?> capturePhoto(AppServices s, CaptureFrom from) async {
  final shot = await s.capture.takePhoto(from: from);
  if (shot == null) return null;
  final Uint8List bytes;
  try {
    bytes = await s.files.read(shot.path);
  } on Object {
    throw PhotoProblem.bad;
  } finally {
    await shot.discard();
  }
  if (bytes.isEmpty) throw PhotoProblem.bad;
  if (!VerificationDocumentRules.fitsSizeLimit(bytes.length)) {
    throw PhotoProblem.tooLarge;
  }
  if (!VerificationDocumentRules.isAcceptedContentType(shot.contentType)) {
    throw PhotoProblem.badType;
  }
  return LocalPhoto(bytes, shot.contentType);
}

/// Maps an upload failure: a [PhotoProblem] for this photo, else the
/// generic message (`Check your connection and try again.`).
({PhotoProblem? problem, String? message}) uploadFailure(Object e) {
  if (e is NitumeApiException) {
    if (e.isPayloadTooLarge ||
        e.code == ApiErrorCodes.verificationDocumentTooLarge) {
      return (problem: PhotoProblem.tooLarge, message: null);
    }
    if (e.code == ApiErrorCodes.verificationDocumentTypeInvalid) {
      return (problem: PhotoProblem.badType, message: null);
    }
    if (e.code == ApiErrorCodes.verificationDocumentSideInvalid ||
        e.code == ApiErrorCodes.verificationDocumentEmpty) {
      return (problem: PhotoProblem.bad, message: null);
    }
  }
  return (problem: null, message: friendlyError(e));
}
