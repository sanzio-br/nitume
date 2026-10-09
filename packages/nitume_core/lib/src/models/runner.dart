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
      skills: [
        for (final s in (json['skills'] as List? ?? const []))
          RunnerSkill.fromWire(s as String),
      ],
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
    this.runner,
  });

  final String id;

  /// `assigned` or `accepted`.
  final AssignmentStatus status;
  final DateTime? assignedAt;
  final RunnerSummary? runner;

  factory ErrandAssignment.fromJson(Map<String, dynamic> json) =>
      ErrandAssignment(
        id: json['id'] as String,
        status: AssignmentStatus.fromWire(json['status'] as String),
        assignedAt: parseDate(json['assignedAt']),
        runner: json['runner'] == null
            ? null
            : RunnerSummary.fromJson(asJsonMap(json['runner'])),
      );
}
