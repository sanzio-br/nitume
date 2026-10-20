import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import '../jobs/offer_presentation.dart';

/// Per-job reads `v-active` needs besides the held-job view.
class JobDetails {
  const JobDetails({
    this.evidence = const [],
    this.history = const [],
    this.pendingPrice,
    this.dispute,
  });

  final List<Evidence> evidence;
  final List<StatusHistoryEntry> history;
  final PriceChangeRequest? pendingPrice;
  final Dispute? dispute;

  int count(EvidenceType type) => evidence.where((e) => e.type == type).length;

  /// The newest history entry into [status].
  StatusHistoryEntry? entryFor(ErrandStatus status) {
    StatusHistoryEntry? found;
    for (final h in history) {
      if (h.toStatus != status) continue;
      if (found == null ||
          (h.createdAt ?? DateTime(0)).isAfter(
            found.createdAt ?? DateTime(0),
          )) {
        found = h;
      }
    }
    return found;
  }

  /// When the job became CANCELLED / FAILED.
  DateTime? get endedAt =>
      (entryFor(ErrandStatus.cancelled) ?? entryFor(ErrandStatus.failed))
          ?.createdAt;
}

/// The job needs a receipt (`send_to_runner` with an item amount, rows 95,
/// 105).
bool needsReceipt(RunnerJobView job) =>
    job.merchantRoute == MerchantRoute.sendToRunner && job.itemAmount != null;

/// Price changes: IN_PROGRESS, Buy For Me / Get It For Me (rows 49, 101).
bool canRequestPrice(RunnerJobView job, ErrandStatus status) =>
    status == ErrandStatus.inProgress &&
    (job.category == ErrandCategory.buyForMe ||
        job.category == ErrandCategory.getItForMe);

ErrandLocation? pointOf(RunnerJobView job, ErrandPointType type) {
  for (final l in job.locations) {
    if (l.pointType == type) return l;
  }
  return null;
}

/// The next point for the state: the pickup before IN_PROGRESS when there
/// is one, else the task site; the drop-off from IN_PROGRESS when there is
/// one.
ErrandLocation? destinationFor(RunnerJobView job, ErrandStatus status) {
  final pickup = pointOf(job, ErrandPointType.pickup);
  final site = pointOf(job, ErrandPointType.taskSite);
  final drop = pointOf(job, ErrandPointType.dropoff);
  if (status == ErrandStatus.inProgress && drop != null) return drop;
  if (status != ErrandStatus.inProgress && pickup != null) return pickup;
  return site ?? pickup ?? drop ?? firstPointOf(job);
}

/// Google Maps turn-by-turn (`_shared.md` §10); never in-app navigation.
Uri navigationUri(ErrandLocation p) =>
    defaultTargetPlatform == TargetPlatform.android
    ? Uri.parse('google.navigation:q=${p.lat},${p.lng}')
    : Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}',
      );

/// `#NT-10482 · Check It For Me · Due Tue, 4:12 PM`: Sans with the
/// reference and time in Fira Code. `Due` only while working (rows 185,
/// 206, 239).
({String text, InlineSpan span}) jobHeaderMeta(
  RunnerJobView job,
  ErrandStatus status,
  DateTime now,
) {
  final parts = <List<(String, bool)>>[
    if (job.reference.isNotEmpty) [('#${job.reference}', true)],
    [(job.category.label, false)],
    if (job.deadlineAt != null &&
        RunnerJobsRepository.workingStatuses.contains(status))
      [('Due ', false), (formatDayTimeEat(job.deadlineAt!, now: now), true)],
  ];
  final text = parts.map((p) => p.map((s) => s.$1).join()).join(' · ');
  final span = TextSpan(
    children: [
      for (final (i, part) in parts.indexed) ...[
        if (i > 0) const TextSpan(text: ' · '),
        for (final (t, numeric) in part)
          numeric ? NumSpan(t) : TextSpan(text: t),
      ],
    ],
  );
  return (text: text, span: span);
}
