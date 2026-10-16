import 'enums.dart';
import 'json_utils.dart';

/// Runner verification check type (`runner_verifications.verificationType`).
enum RunnerVerificationType {
  phone('phone'),
  governmentId('government_id'),
  selfie('selfie'),
  paymentIdentity('payment_identity'),
  reference('reference'),
  business('business');

  const RunnerVerificationType(this.wire);
  final String wire;

  /// `null` for values this build does not know.
  static RunnerVerificationType? tryFromWire(String? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// Which side of the ID card a [RunnerVerificationType.governmentId] image
/// shows (rows 195, 200). Lowercase on the wire; screens show [label]
/// ("Front" / "Back"). Selfies have no side.
enum VerificationDocumentSide {
  front('front', 'Front'),
  back('back', 'Back');

  const VerificationDocumentSide(this.wire, this.label);
  final String wire;

  /// Display text.
  final String label;

  /// Tolerant parse (trims, ignores case); `null` for a missing or unknown
  /// value (selfies and ID rows stored before row 195).
  static VerificationDocumentSide? tryFromWire(Object? v) {
    if (v is! String) return null;
    final s = v.trim().toLowerCase();
    for (final e in values) {
      if (e.wire == s) return e;
    }
    return null;
  }
}

/// Review state of one verification record.
enum VerificationStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const VerificationStatus(this.wire);
  final String wire;

  static VerificationStatus? tryFromWire(String? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// The signed-in runner's own profile, `GET /runners/me`.
///
/// Today the API returns the raw `runner_profiles` row (RA-18 asks for a
/// runner view). Only the fields the runner screens need are read; the
/// trust score and stored location are deliberately not modelled.
/// [shortName], [skills] and [serviceAreas] are read when the API adds them
/// (RA-10, RA-18) and are `null` until then; never compute a short name on
/// the client (row 40).
class RunnerMe {
  const RunnerMe({
    required this.id,
    required this.userId,
    required this.verificationLevel,
    required this.availability,
    required this.avgRating,
    required this.errandsCompleted,
    required this.completionRate,
    required this.maxPurchaseAdvance,
    this.lastPingAt,
    this.shortName,
    this.skills,
    this.serviceAreas,
  });

  /// Runner profile id.
  final String id;
  final String userId;
  final VerificationLevel verificationLevel;
  final RunnerAvailability availability;

  /// Decimal string (`"4.90"`); format with `formatRating`.
  final String avgRating;
  final int errandsCompleted;

  /// 0–100 decimal string (`"98.70"`).
  final String completionRate;

  /// Largest purchase the runner may pay out of pocket (row 108), decimal
  /// string in KES.
  final String maxPurchaseAdvance;
  final DateTime? lastPingAt;
  final String? shortName;
  final List<RunnerSkill>? skills;
  final List<String>? serviceAreas;

  bool get isOnline => availability == RunnerAvailability.online;

  factory RunnerMe.fromJson(Map<String, dynamic> json) {
    final skills = json['skills'];
    final areas = json['serviceAreas'];
    return RunnerMe(
      id: json['id'] as String,
      userId: json['userId'] as String,
      verificationLevel: VerificationLevel.fromWire(
        json['verificationLevel'] as String,
      ),
      availability: RunnerAvailability.fromWire(json['availability'] as String),
      avgRating: parseDecimalOrZero(json['avgRating']),
      errandsCompleted: (json['errandsCompleted'] as num?)?.toInt() ?? 0,
      completionRate: parseDecimalOrZero(json['completionRate']),
      maxPurchaseAdvance: parseDecimalOrZero(json['maxPurchaseAdvance']),
      lastPingAt: parseDate(json['lastPingAt']),
      shortName: parseOptionalString(json['shortName']),
      skills: skills is List ? RunnerSkill.listFromWire(skills) : null,
      serviceAreas: areas is List ? [for (final a in areas) '$a'] : null,
    );
  }
}

/// One verification record, `GET /runners/me/verifications` and the
/// document upload.
///
/// The reviewer's note is not modelled: the runner never sees it
/// (`v-onboard-pending`). The API never returns the storage key (rows 125,
/// 154); [hasDocument] says whether an image is still stored and
/// [purgedAt] when it was deleted at the end of retention (row 144).
class RunnerVerification {
  const RunnerVerification({
    required this.id,
    required this.type,
    required this.status,
    this.createdAt,
    this.reviewedAt,
    this.hasDocument = false,
    this.purgedAt,
    this.side,
  });

  final String id;

  /// `null` when the API sends a type this build does not know.
  final RunnerVerificationType? type;
  final VerificationStatus status;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

  /// True while an ID or selfie image is stored for this record.
  final bool hasDocument;

  /// When the image was purged (retention, rows 144, 154); `null` otherwise.
  final DateTime? purgedAt;

  /// ID side of a government ID image (row 195); `null` for selfies, other
  /// types and ID rows stored before sides were recorded.
  final VerificationDocumentSide? side;

  factory RunnerVerification.fromJson(Map<String, dynamic> json) =>
      RunnerVerification(
        id: json['id'] as String,
        type: RunnerVerificationType.tryFromWire(
          json['verificationType'] as String?,
        ),
        status:
            VerificationStatus.tryFromWire(json['status'] as String?) ??
            VerificationStatus.pending,
        createdAt: parseDate(json['createdAt']),
        reviewedAt: parseDate(json['reviewedAt']),
        hasDocument: json['hasDocument'] == true,
        purgedAt: parseDate(json['purgedAt']),
        side: VerificationDocumentSide.tryFromWire(json['side']),
      );

  /// Newest record per type (the list is newest first, so the first one
  /// wins), as `v-onboard-pending` shows it.
  static Map<RunnerVerificationType, RunnerVerification> latestByType(
    Iterable<RunnerVerification> records,
  ) {
    final out = <RunnerVerificationType, RunnerVerification>{};
    final sorted = records.toList()
      ..sort(
        (a, b) =>
            (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)),
      );
    for (final r in sorted) {
      final t = r.type;
      if (t != null) out.putIfAbsent(t, () => r);
    }
    return out;
  }
}

/// The newest ID and selfie records, grouped as the capture and status
/// screens show them (`v-onboard-id`, `v-onboard-pending`, Profile ->
/// `Verification documents`; rows 195, 200).
///
/// ID front and back are separate [RunnerVerificationType.governmentId]
/// records told apart by [RunnerVerification.side]. A legacy ID record
/// without a side never fills the Front or Back tile; the newest one is kept
/// in [idUnknownSide] so a screen can still show it as "side unknown".
class RunnerVerificationDocuments {
  const RunnerVerificationDocuments({
    this.idFront,
    this.idBack,
    this.idUnknownSide,
    this.selfie,
  });

  /// Groups [records] (any order): for each slot the record with the latest
  /// `createdAt` wins; on a tie, or with no dates, the earlier record in
  /// [records] wins (the API lists newest first). Other types are ignored.
  factory RunnerVerificationDocuments.fromRecords(
    Iterable<RunnerVerification> records,
  ) {
    RunnerVerification? front, back, unknown, selfie;
    RunnerVerification? newer(RunnerVerification? kept, RunnerVerification r) {
      if (kept == null) return r;
      final a = kept.createdAt ?? DateTime(0);
      final b = r.createdAt ?? DateTime(0);
      return b.isAfter(a) ? r : kept;
    }

    for (final r in records) {
      switch (r.type) {
        case RunnerVerificationType.governmentId:
          switch (r.side) {
            case VerificationDocumentSide.front:
              front = newer(front, r);
            case VerificationDocumentSide.back:
              back = newer(back, r);
            case null:
              unknown = newer(unknown, r);
          }
        case RunnerVerificationType.selfie:
          selfie = newer(selfie, r);
        default:
          break;
      }
    }
    return RunnerVerificationDocuments(
      idFront: front,
      idBack: back,
      idUnknownSide: unknown,
      selfie: selfie,
    );
  }

  /// Newest ID record with side `front`; `null` when none.
  final RunnerVerification? idFront;

  /// Newest ID record with side `back`; `null` when none.
  final RunnerVerification? idBack;

  /// Newest legacy ID record stored without a side; it fills no tile.
  final RunnerVerification? idUnknownSide;

  /// Newest selfie record; `null` when none.
  final RunnerVerification? selfie;

  /// The ID record for [side] (the Front or Back tile).
  RunnerVerification? idFor(VerificationDocumentSide side) => switch (side) {
    VerificationDocumentSide.front => idFront,
    VerificationDocumentSide.back => idBack,
  };
}

/// Client-side rules for ID and selfie images sent with
/// `RunnerAccountRepository.uploadVerificationDocument` (rows 154, 163).
/// The API enforces the same rules; checking first saves the runner a
/// failed upload.
abstract final class VerificationDocumentRules {
  /// Largest image accepted: 10 MB (row 163, `RUNNER_ID_MAX_UPLOAD_BYTES`).
  /// Larger files get a 413.
  static const maxBytes = 10 * 1024 * 1024;

  /// Image types the API accepts (`verification_document_type_invalid`
  /// otherwise).
  static const contentTypes = {
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  };

  /// Verification types that are uploaded as an image
  /// (`verification_type_not_uploadable` otherwise). ID front and back are
  /// two uploads of [RunnerVerificationType.governmentId].
  static const uploadableTypes = {
    RunnerVerificationType.governmentId,
    RunnerVerificationType.selfie,
  };

  /// True when an image of [byteLength] bytes may be uploaded (not empty,
  /// at most [maxBytes]).
  static bool fitsSizeLimit(int byteLength) =>
      byteLength > 0 && byteLength <= maxBytes;

  /// True when [contentType] is one of [contentTypes] (case-insensitive,
  /// parameters ignored).
  static bool isAcceptedContentType(String contentType) =>
      contentTypes.contains(contentType.split(';').first.trim().toLowerCase());
}
