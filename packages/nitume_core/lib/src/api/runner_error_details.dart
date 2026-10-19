import '../models/enums.dart';
import 'api_exception.dart';

/// Typed details of the runner job error codes (RA-11, RA-12, row 129).
/// Kept beside [NitumeApiException] as an extension; read them only after
/// checking [NitumeApiException.code].
extension RunnerErrorDetails on NitumeApiException {
  /// `missing` of [ApiErrorCodes.evidenceRequired]: what still has to be
  /// uploaded before IN_PROGRESS → AWAITING_CUSTOMER (`photo`, `receipt`).
  /// Unknown values are skipped; `null` when absent.
  List<EvidenceType>? get missingEvidence => _types(details['missing']);

  /// `allowed.type` of [ApiErrorCodes.evidenceTypeNotAllowed]: the evidence
  /// types a runner may upload (photo, receipt). `null` when absent.
  List<EvidenceType>? get allowedEvidenceTypes {
    final allowed = details['allowed'];
    return allowed is Map ? _types(allowed['type']) : null;
  }

  /// `allowed.contentType` of [ApiErrorCodes.evidenceTypeNotAllowed]
  /// (`image/*`); `null` when absent.
  String? get allowedEvidenceContentType {
    final allowed = details['allowed'];
    final v = allowed is Map ? allowed['contentType'] : null;
    return v is String && v.isNotEmpty ? v : null;
  }

  /// `status` of [ApiErrorCodes.evidenceNotAllowed]: the task state that
  /// refused the upload; `null` when absent or unknown.
  ErrandStatus? get evidenceRefusedStatus =>
      ErrandStatus.tryFromWire(details['status']);

  /// `type` of [ApiErrorCodes.evidenceNotAllowed]; `null` when absent or
  /// unknown.
  EvidenceType? get evidenceRefusedType {
    final t = _types([details['type']]);
    return t == null || t.isEmpty ? null : t.single;
  }

  /// `endedAt` of [ApiErrorCodes.reimbursementWindowClosed]: when the task
  /// was CANCELLED / FAILED.
  DateTime? get jobEndedAt => _date(details['endedAt']);

  /// `windowEndsAt` of [ApiErrorCodes.reimbursementWindowClosed]: when the
  /// 24 h receipt window closed (show in Fira Code, EAT).
  DateTime? get receiptWindowEndsAt => _date(details['windowEndsAt']);
}

List<EvidenceType>? _types(Object? v) {
  if (v is! List) return null;
  return [
    for (final e in v)
      for (final t in EvidenceType.values)
        if (t.wire == e) t,
  ];
}

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
