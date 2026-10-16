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
      skills: skills is List
          ? [for (final s in skills) RunnerSkill.fromWire('$s')]
          : null,
      serviceAreas: areas is List ? [for (final a in areas) '$a'] : null,
    );
  }
}

/// One verification record, `GET /runners/me/verifications`.
///
/// The reviewer's note and the document key are not modelled: the runner
/// never sees them (`v-onboard-pending`; RA-7 may add a runner-safe
/// reason later).
class RunnerVerification {
  const RunnerVerification({
    required this.id,
    required this.type,
    required this.status,
    this.createdAt,
    this.reviewedAt,
  });

  final String id;

  /// `null` when the API sends a type this build does not know.
  final RunnerVerificationType? type;
  final VerificationStatus status;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

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
