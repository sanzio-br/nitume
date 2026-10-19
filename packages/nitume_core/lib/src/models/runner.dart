import 'enums.dart';
import 'json_utils.dart';

/// Customer-facing runner summary (`RunnerPublicSummary`), embedded in
/// `Errand.assignment.runner` and the tracking snapshot.
///
/// [displayName] is optional: show it when present, never invent one.
/// Customers see the runner by [shortName] (row 40).
class RunnerSummary {
  const RunnerSummary({
    required this.id,
    required this.verificationLevel,
    required this.avgRating,
    required this.errandsCompleted,
    this.displayName,
    this.shortName,
  });

  /// Runner profile id (use with `GET /runners/:id/profile`).
  final String id;
  final VerificationLevel verificationLevel;

  /// Decimal string, e.g. `"4.90"` (format with `formatRating`).
  final String avgRating;
  final int errandsCompleted;

  /// Runner display name (Q2, decided). API shape pending api-contract
  /// (`display_name`, A-15); `null` when absent.
  final String? displayName;

  /// First name + last initial (`Kevin O.`), computed by the API (row 40).
  /// Render it exactly as returned; never shorten [displayName] on the
  /// client. `null` until the runner has a name (the screen shows its
  /// fallback, e.g. `Your runner`).
  final String? shortName;

  factory RunnerSummary.fromJson(Map<String, dynamic> json) => RunnerSummary(
    id: json['id'] as String,
    verificationLevel: VerificationLevel.fromWire(
      json['verificationLevel'] as String,
    ),
    avgRating: parseDecimal(json['avgRating']) ?? '0.00',
    errandsCompleted: (json['errandsCompleted'] as num?)?.toInt() ?? 0,
    displayName: parseOptionalString(json['displayName']),
    shortName: parseOptionalString(json['shortName']),
  );
}

/// Public runner profile, `GET /runners/:id/profile`.
class RunnerPublicProfile extends RunnerSummary {
  const RunnerPublicProfile({
    required super.id,
    required super.verificationLevel,
    required super.avgRating,
    required super.errandsCompleted,
    super.displayName,
    super.shortName,
    required this.availability,
    required this.skills,
    required this.serviceAreas,
  });

  final RunnerAvailability availability;
  final List<RunnerSkill> skills;
  final List<String> serviceAreas;

  factory RunnerPublicProfile.fromJson(Map<String, dynamic> json) {
    final base = RunnerSummary.fromJson(json);
    return RunnerPublicProfile(
      id: base.id,
      verificationLevel: base.verificationLevel,
      avgRating: base.avgRating,
      errandsCompleted: base.errandsCompleted,
      displayName: base.displayName,
      shortName: base.shortName,
      availability: RunnerAvailability.fromWire(json['availability'] as String),
      skills: RunnerSkill.listFromWire(json['skills']),
      serviceAreas: [
        for (final a in (json['serviceAreas'] as List? ?? const [])) '$a',
      ],
    );
  }
}

/// The runner currently holding an errand (`ErrandAssignmentView`), or
/// `null` on the errand until a runner is assigned.
class ErrandAssignment {
  const ErrandAssignment({
    required this.id,
    required this.status,
    required this.assignedAt,
    this.offerExpiresAt,
    this.runner,
  });

  final String id;

  /// `assigned` (open offer) or `accepted`; `expired` once an offer lapsed.
  /// `null` for a value this build does not know.
  final AssignmentStatus? status;
  final DateTime? assignedAt;

  /// Acceptance deadline of the offer (rows 114, 141, 150): after it the
  /// runner can no longer accept (409 `offer_expired`). `null` on offers made
  /// before deadlines existed (row 156): show no countdown and never remove
  /// such an offer on the client. Kept for the record once accepted.
  final DateTime? offerExpiresAt;
  final RunnerSummary? runner;

  /// True when this is an open offer whose deadline has passed at [now]
  /// (the offer card disappears). Always false without a deadline (row 156)
  /// or once accepted.
  bool offerLapsedAt(DateTime now) {
    final deadline = offerExpiresAt;
    return (status?.isOpenOffer ?? false) &&
        deadline != null &&
        !now.isBefore(deadline);
  }

  /// Time left to accept an open offer at [now], never negative; `null`
  /// without a deadline or when the assignment is not an open offer (no
  /// countdown, row 156).
  Duration? offerTimeLeftAt(DateTime now) {
    final deadline = offerExpiresAt;
    if (deadline == null || !(status?.isOpenOffer ?? false)) return null;
    final left = deadline.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  factory ErrandAssignment.fromJson(Map<String, dynamic> json) =>
      ErrandAssignment(
        id: json['id'] as String,
        status: AssignmentStatus.tryFromWire(json['status']),
        assignedAt: parseDate(json['assignedAt']),
        offerExpiresAt: parseDate(json['offerExpiresAt']),
        runner: json['runner'] == null
            ? null
            : RunnerSummary.fromJson(asJsonMap(json['runner'])),
      );
}
