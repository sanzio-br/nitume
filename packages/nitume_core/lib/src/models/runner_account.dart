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
  static RunnerVerificationType? tryFromWire(Object? v) {
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
        type: RunnerVerificationType.tryFromWire(json['type']),
        side: VerificationDocumentSide.tryFromWire(json['side']),
        status:
            VerificationCheckStatus.tryFromWire(json['status']) ??
            VerificationCheckStatus.missing,
      );
}

/// A Level 2 check (row 261) as named in
/// [RunnerVerificationSummary.level2Missing].
enum Level2Check {
  governmentIdFront('government_id_front'),
  governmentIdBack('government_id_back'),
  selfie('selfie');

  const Level2Check(this.wire);
  final String wire;

  /// `null` for an absent or unknown value.
  static Level2Check? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// `RunnerMe.verification` and the `verification` detail of a 403
/// `runner_not_verified` (RA-8, row 126): the runner is [verified] only
/// when every required check is approved. [checks] keeps the API's order
/// (phone, ID front, ID back, selfie, payment identity).
class RunnerVerificationSummary {
  const RunnerVerificationSummary({
    required this.verified,
    this.checks = const [],
    this.level2Missing,
  });

  /// Not verified, no checks known (the API sent no summary).
  static const unknown = RunnerVerificationSummary(verified: false);

  /// As the API computed it; never derived on the client.
  final bool verified;
  final List<RunnerVerificationCheck> checks;

  /// The Level 2 checks (row 261: ID front, ID back, selfie) whose newest
  /// record is not approved, in the API's order; empty when the runner
  /// meets the Level 2 rule (RN-L1). Computed by the API, unlabelled ID
  /// records included (row 268); never derive it on the client.
  ///
  /// `null` when the API did not send it (older API, 403 detail); unknown
  /// values are skipped.
  final List<Level2Check>? level2Missing;

  /// True when the API says the Level 2 rule is met, false when it lists a
  /// missing check, `null` when [level2Missing] is unknown.
  bool? get meetsLevel2 => level2Missing?.isEmpty;

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
    final missing = json['level2Missing'];
    return RunnerVerificationSummary(
      verified: json['verified'] == true,
      checks: [
        if (raw is List)
          for (final c in raw)
            if (c is Map)
              RunnerVerificationCheck.fromJson(c.cast<String, dynamic>()),
      ],
      level2Missing: missing is List
          ? [for (final m in missing) ?Level2Check.tryFromWire(m)]
          : null,
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
  /// wins), as `v-onboard-pending` shows the phone, selfie and payment
  /// identity rows.
  ///
  /// [RunnerVerificationType.governmentId] is never in the map: its two
  /// sides are separate records, and the newest of them could hide a
  /// rejected side (row 209). Use
  /// [RunnerVerificationDocuments.nationalIdStatus] for the National ID row.
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
      if (t != null && t != RunnerVerificationType.governmentId) {
        out.putIfAbsent(t, () => r);
      }
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
///
/// The status of each side ([idStatusFor]) can differ from the tile: an
/// approved unlabelled record counts for a side with no labelled record
/// (row 268). The single `National ID` status row reads [nationalIdStatus]
/// and [idRejectedSides] (row 209).
class RunnerVerificationDocuments {
  const RunnerVerificationDocuments({
    this.idFront,
    this.idBack,
    this.idUnknownSide,
    this.selfie,
    this._idFrontStatus,
    this._idBackStatus,
  });

  /// Groups [records] (any order): for each slot the record with the latest
  /// `createdAt` wins; on a tie, or with no dates, the earlier record in
  /// [records] wins (the API lists newest first). Other types are ignored.
  ///
  /// The ID side statuses ([idStatusFor]) come from [summary] (the
  /// `GET /runners/me` `verification`, the source of truth) when it carries
  /// the ID front/back checks; otherwise they are computed from [records]
  /// with the API's row-268 rule, see [idSideStatusesOf].
  factory RunnerVerificationDocuments.fromRecords(
    Iterable<RunnerVerification> records, {
    RunnerVerificationSummary? summary,
  }) {
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
    final local = idSideStatusesOf(records);
    VerificationCheckStatus statusOf(VerificationDocumentSide side) =>
        summary
            ?.checkFor(RunnerVerificationType.governmentId, side: side)
            ?.status ??
        local[side]!;
    return RunnerVerificationDocuments(
      idFront: front,
      idBack: back,
      idUnknownSide: unknown,
      selfie: selfie,
      idFrontStatus: statusOf(VerificationDocumentSide.front),
      idBackStatus: statusOf(VerificationDocumentSide.back),
    );
  }

  /// The status of ID front and back from [records], exactly as the API
  /// computes its `verification.checks` (row 268, owner 2026-10-21):
  /// - a side with a labelled record takes its newest labelled record
  ///   (labelled records always win over unlabelled ones);
  /// - a side with no labelled record is filled, as approved, by an
  ///   approved unlabelled [RunnerVerificationType.governmentId] record,
  ///   one side per record, front first;
  /// - pending or rejected unlabelled records fill nothing (the side stays
  ///   [VerificationCheckStatus.missing]).
  ///
  /// Only a fallback: prefer the API summary (see [fromRecords]).
  static Map<VerificationDocumentSide, VerificationCheckStatus>
  idSideStatusesOf(Iterable<RunnerVerification> records) {
    final ids = records
        .where((r) => r.type == RunnerVerificationType.governmentId)
        .toList();
    var spare = ids
        .where((r) => r.side == null && r.status == VerificationStatus.approved)
        .length;
    final out = <VerificationDocumentSide, VerificationCheckStatus>{};
    for (final side in VerificationDocumentSide.values) {
      RunnerVerification? labelled;
      for (final r in ids) {
        if (r.side != side) continue;
        final a = labelled?.createdAt ?? DateTime(0);
        if (labelled == null || (r.createdAt ?? DateTime(0)).isAfter(a)) {
          labelled = r;
        }
      }
      if (labelled != null) {
        out[side] = _checkStatusOf(labelled.status);
      } else if (spare > 0) {
        spare -= 1;
        out[side] = VerificationCheckStatus.approved;
      } else {
        out[side] = VerificationCheckStatus.missing;
      }
    }
    return out;
  }

  static VerificationCheckStatus _checkStatusOf(VerificationStatus s) =>
      switch (s) {
        VerificationStatus.approved => VerificationCheckStatus.approved,
        VerificationStatus.pending => VerificationCheckStatus.pending,
        VerificationStatus.rejected => VerificationCheckStatus.rejected,
      };

  /// Newest ID record with side `front`; `null` when none.
  final RunnerVerification? idFront;

  /// Newest ID record with side `back`; `null` when none.
  final RunnerVerification? idBack;

  /// Newest legacy ID record stored without a side; it fills no tile.
  final RunnerVerification? idUnknownSide;

  /// Newest selfie record; `null` when none.
  final RunnerVerification? selfie;

  final VerificationCheckStatus? _idFrontStatus;
  final VerificationCheckStatus? _idBackStatus;

  /// The ID record for [side] (the Front or Back tile).
  RunnerVerification? idFor(VerificationDocumentSide side) => switch (side) {
    VerificationDocumentSide.front => idFront,
    VerificationDocumentSide.back => idBack,
  };

  /// The status of ID [side] as the API counts it (row 268): from the API
  /// summary when given to [fromRecords], else [idSideStatusesOf]. Can be
  /// [VerificationCheckStatus.approved] with no [idFor] record (an approved
  /// unlabelled record fills it): such a side is done, never ask for it
  /// again. With the plain constructor and no status, the [idFor] record's
  /// status.
  VerificationCheckStatus idStatusFor(VerificationDocumentSide side) =>
      switch (side) {
        VerificationDocumentSide.front => _idFrontStatus,
        VerificationDocumentSide.back => _idBackStatus,
      } ??
      switch (idFor(side)?.status) {
        final s? => _checkStatusOf(s),
        null => VerificationCheckStatus.missing,
      };

  /// The combined `National ID` status (row 209, owner 2026-10-19), from
  /// the status of each side ([idStatusFor], row 268):
  /// - [VerificationCheckStatus.approved] only if both sides are approved;
  /// - [VerificationCheckStatus.rejected] if either side is rejected (see
  ///   [idRejectedSides]);
  /// - otherwise [VerificationCheckStatus.pending] if either side is
  ///   pending;
  /// - otherwise [VerificationCheckStatus.missing] (a side not uploaded yet;
  ///   the screens' proposed `Not started`).
  ///
  /// The newest ID record across both sides never decides it.
  VerificationCheckStatus get nationalIdStatus {
    final front = idStatusFor(VerificationDocumentSide.front);
    final back = idStatusFor(VerificationDocumentSide.back);
    if (front == VerificationCheckStatus.approved &&
        back == VerificationCheckStatus.approved) {
      return VerificationCheckStatus.approved;
    }
    if (front == VerificationCheckStatus.rejected ||
        back == VerificationCheckStatus.rejected) {
      return VerificationCheckStatus.rejected;
    }
    if (front == VerificationCheckStatus.pending ||
        back == VerificationCheckStatus.pending) {
      return VerificationCheckStatus.pending;
    }
    return VerificationCheckStatus.missing;
  }

  /// The ID sides whose status ([idStatusFor]) is rejected, front first;
  /// empty when none. Drives the `Front photo not approved` / `Back photo
  /// not approved` / `Both photos not approved` caption and which side
  /// `Upload again` selects.
  List<VerificationDocumentSide> get idRejectedSides => [
    for (final side in VerificationDocumentSide.values)
      if (idStatusFor(side) == VerificationCheckStatus.rejected) side,
  ];
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
