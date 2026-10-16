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

/// One ops-configured service area (owner row 116), `{ id, name }`:
/// `GET /runners/service-areas`, `RunnerMe.serviceAreas` and the reply of
/// `PUT /runners/me/service-areas`. Send [id]; show [name].
class ServiceAreaOption {
  const ServiceAreaOption({required this.id, required this.name});

  /// Stable slug the API stores and accepts.
  final String id;

  /// What people read.
  final String name;

  factory ServiceAreaOption.fromJson(Map<String, dynamic> json) =>
      ServiceAreaOption(id: '${json['id']}', name: '${json['name']}');

  /// Parses a wire list, skipping entries without an `id` or `name`. Never
  /// throws; anything but a list gives an empty list.
  static List<ServiceAreaOption> listFromJson(Object? value) {
    if (value is! List) return const [];
    return [
      for (final e in value)
        if (e is Map &&
            parseOptionalString(e['id']) != null &&
            parseOptionalString(e['name']) != null)
          ServiceAreaOption.fromJson(e.cast<String, dynamic>()),
    ];
  }

  @override
  bool operator ==(Object other) =>
      other is ServiceAreaOption && other.id == id && other.name == name;

  @override
  int get hashCode => Object.hash(id, name);

  @override
  String toString() => 'ServiceAreaOption($id, $name)';
}

/// State of one required verification check (RA-8): the newest record's
/// review state, or [missing] when there is no record yet.
enum VerificationCheckStatus {
  approved('approved'),
  pending('pending'),
  rejected('rejected'),
  missing('missing');

  const VerificationCheckStatus(this.wire);
  final String wire;

  /// `null` for an absent or unknown value.
  static VerificationCheckStatus? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// One required check in [RunnerVerificationSummary.checks].
class RunnerVerificationCheck {
  const RunnerVerificationCheck({
    required this.type,
    required this.status,
    this.side,
  });

  /// `null` when the API sends a type this build does not know.
  final RunnerVerificationType? type;

  /// `front` / `back` for the two ID images; `null` for other checks.
  final VerificationDocumentSide? side;

  /// An unknown status reads as [VerificationCheckStatus.missing] (never as
  /// approved).
  final VerificationCheckStatus status;

  bool get isApproved => status == VerificationCheckStatus.approved;

  factory RunnerVerificationCheck.fromJson(Map<String, dynamic> json) =>
      RunnerVerificationCheck(
        type: RunnerVerificationType.tryFromWire(json['type'] as String?),
        side: VerificationDocumentSide.tryFromWire(json['side']),
        status:
            VerificationCheckStatus.tryFromWire(json['status']) ??
            VerificationCheckStatus.missing,
      );
}

/// `RunnerMe.verification` and the `verification` detail of a 403
/// `runner_not_verified` (RA-8, row 126): the runner is [verified] only
/// when every required check is approved. [checks] keeps the API's order
/// (phone, ID front, ID back, selfie, payment identity).
class RunnerVerificationSummary {
  const RunnerVerificationSummary({
    required this.verified,
    this.checks = const [],
  });

  /// Not verified, no checks known (the API sent no summary).
  static const unknown = RunnerVerificationSummary(verified: false);

  /// As the API computed it; never derived on the client.
  final bool verified;
  final List<RunnerVerificationCheck> checks;

  /// The check for [type] (and [side] for an ID image); `null` when absent.
  RunnerVerificationCheck? checkFor(
    RunnerVerificationType type, {
    VerificationDocumentSide? side,
  }) {
    for (final c in checks) {
      if (c.type == type && c.side == side) return c;
    }
    return null;
  }

  factory RunnerVerificationSummary.fromJson(Map<String, dynamic> json) {
    final raw = json['checks'];
    return RunnerVerificationSummary(
      verified: json['verified'] == true,
      checks: [
        if (raw is List)
          for (final c in raw)
            if (c is Map)
              RunnerVerificationCheck.fromJson(c.cast<String, dynamic>()),
      ],
    );
  }

  /// [unknown] when [value] is not a JSON object.
  static RunnerVerificationSummary fromJsonOrUnknown(Object? value) =>
      value is Map
      ? RunnerVerificationSummary.fromJson(value.cast<String, dynamic>())
      : unknown;
}

/// The signed-in runner's own view, `GET /runners/me` (`RunnerSelfView`,
/// RA-18). Also returned by `PATCH /runners/me/availability`. No trust score
/// or stored location.
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
    this.displayName,
    this.shortName,
    this.lastPingAt,
    this.skills = const [],
    this.serviceAreas = const [],
    this.verification = RunnerVerificationSummary.unknown,
  });

  /// Runner profile id.
  final String id;
  final String userId;

  /// The runner's name; `null` until set.
  final String? displayName;

  /// First name + last initial (`Kevin O.`), computed by the API (row 40);
  /// `null` until a name is set. Never shorten [displayName] on the client.
  final String? shortName;
  final VerificationLevel verificationLevel;

  /// `online` | `offline` | `busy`. Busy is server-set while a job is active
  /// (RA-20). An unknown value reads as offline.
  final RunnerAvailability availability;

  /// Decimal string (`"4.90"`); format with `formatRating`.
  final String avgRating;
  final int errandsCompleted;

  /// 0–100 decimal string (`"98.70"`).
  final String completionRate;

  /// Largest purchase the runner may pay out of pocket (rows 108, 138),
  /// decimal string in KES. Read-only for the runner.
  final String maxPurchaseAdvance;
  final DateTime? lastPingAt;

  /// Category order; unknown values are skipped.
  final List<RunnerSkill> skills;

  /// Listed areas only, by name (row 116).
  final List<ServiceAreaOption> serviceAreas;

  /// Required checks (RA-8). Going online and accepting jobs need
  /// [RunnerVerificationSummary.verified].
  final RunnerVerificationSummary verification;

  bool get isOnline => availability == RunnerAvailability.online;
  bool get isBusy => availability == RunnerAvailability.busy;
  bool get isVerified => verification.verified;

  factory RunnerMe.fromJson(Map<String, dynamic> json) => RunnerMe(
    id: json['id'] as String,
    userId: json['userId'] as String,
    displayName: parseOptionalString(json['displayName']),
    shortName: parseOptionalString(json['shortName']),
    verificationLevel: VerificationLevel.fromWire(
      json['verificationLevel'] as String,
    ),
    availability:
        RunnerAvailability.tryFromWire(json['availability']) ??
        RunnerAvailability.offline,
    avgRating: parseDecimalOrZero(json['avgRating']),
    errandsCompleted: (json['errandsCompleted'] as num?)?.toInt() ?? 0,
    completionRate: parseDecimalOrZero(json['completionRate']),
    maxPurchaseAdvance: parseDecimalOrZero(json['maxPurchaseAdvance']),
    lastPingAt: parseDate(json['lastPingAt']),
    skills: RunnerSkill.listFromWire(json['skills']),
    serviceAreas: ServiceAreaOption.listFromJson(json['serviceAreas']),
    verification: RunnerVerificationSummary.fromJsonOrUnknown(
      json['verification'],
    ),
  );
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
