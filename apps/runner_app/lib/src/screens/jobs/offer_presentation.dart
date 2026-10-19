import 'package:flutter/widgets.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../util/display.dart';

/// Offer copy shared by `v-jobs` and `v-job-detail` (all proposed unless
/// the spec marks it as mockup copy).
abstract final class OfferCopy {
  static const unavailable = DeclineReasonCopy.offerUnavailable;
  static const aboveLimit = 'This job is above your purchase limit.';
  static const busyJobs = 'Finish your active job first.';
  static const busyDetail = 'You already have an active job.';
  static const offline = 'Go online to accept this job.';
  static const customerPaysMerchant = 'Customer pays the merchant';
  static const youPayReimbursed =
      'You pay, reimbursed after the customer confirms';
  static const distanceUnavailable = 'Distance unavailable';
  static const photosRequired = 'Photos required';
}

/// `title` when set, else the category display name (row 41).
String offerTitle(RunnerJobView o) => o.title ?? o.category.label;

/// The first task point (task site, else pickup, else drop-off).
ErrandLocation? firstPointOf(RunnerJobView o) {
  final first = o.firstPoint;
  if (first != null) return first;
  for (final type in const [
    ErrandPointType.taskSite,
    ErrandPointType.pickup,
    ErrandPointType.dropoff,
  ]) {
    for (final l in o.locations) {
      if (l.pointType == type) return l;
    }
  }
  return null;
}

/// Straight-line distance from the device to the first task point, in km;
/// `null` without a device fix (never shown without one, `_shared.md` §7).
double? offerDistanceKm(RunnerJobView o, DevicePosition? fix) {
  final p = firstPointOf(o);
  if (fix == null || p == null) return null;
  final target = DevicePosition(
    lat: p.lat,
    lng: p.lng,
    timestamp: fix.timestamp,
  );
  return fix.distanceTo(target) / 1000;
}

/// How the item is paid (§8), `null` without an item amount route.
String? howItsPaid(RunnerJobView o) => switch (o.merchantRoute) {
  MerchantRoute.merchantDirect => OfferCopy.customerPaysMerchant,
  MerchantRoute.sendToRunner => OfferCopy.youPayReimbursed,
  null => null,
};

/// Offer card meta line (Fira Code, ` · ` separated, only parts that
/// exist): `1.2 km away · Photos required · Item KSh 5,000 · Customer
/// pays the merchant`. No duration; `Photos required` on every offer (row
/// 120: the generic evidence checklist, a fixed line, not an API field).
String? offerMeta(RunnerJobView o, DevicePosition? fix) {
  final km = offerDistanceKm(o, fix);
  final item = o.itemAmount;
  final parts = [
    if (km != null) '${formatDistanceKm(km)} away',
    OfferCopy.photosRequired,
    if (item != null) 'Item ${formatKes(item)}',
    if (item != null) ?howItsPaid(o),
  ];
  return parts.join(' · ');
}

/// Over-limit notice on the offer card (row 108; a fallback since row 186).
NitumeNotice cardLimitNotice(RunnerJobView o) {
  final limit = formatKes(o.maxPurchaseAdvance);
  return NitumeNotice(
    message: 'Above your purchase limit of $limit. You can decline this job.',
    richMessage: TextSpan(
      children: [
        const TextSpan(text: 'Above your purchase limit of '),
        NumSpan(limit),
        const TextSpan(text: '. You can decline this job.'),
      ],
    ),
  );
}

/// What an accept refusal means for the screen.
class AcceptFailure {
  const AcceptFailure({
    this.message,
    this.offerGone = false,
    this.reload = false,
  });

  /// Snackbar text; `null` for none.
  final String? message;

  /// The offer is gone: remove the card / switch to the ended state.
  final bool offerGone;

  /// The runner's state changed (verification): reload the screen.
  final bool reload;
}

/// Maps a `POST /errands/:id/accept` failure (codes as built on
/// `feat/api-runner-1`). [busyMessage] differs per screen.
AcceptFailure acceptFailure(Object e, {required String busyMessage}) {
  if (e is! NitumeApiException) {
    return AcceptFailure(message: friendlyError(e));
  }
  switch (e.code) {
    case ApiErrorCodes.purchaseLimitExceeded:
      return const AcceptFailure(message: OfferCopy.aboveLimit);
    case ApiErrorCodes.offerExpired || ApiErrorCodes.illegalTransition:
      return const AcceptFailure(
        message: OfferCopy.unavailable,
        offerGone: true,
      );
    case ApiErrorCodes.runnerBusy:
      return AcceptFailure(message: busyMessage, reload: true);
    case ApiErrorCodes.runnerOffline:
      return const AcceptFailure(message: OfferCopy.offline, reload: true);
    case ApiErrorCodes.runnerNotVerified:
      return const AcceptFailure(reload: true);
  }
  // 404, or a 403 without a code: the offer is not this runner's any more.
  if (e.statusCode == 404 || (e.statusCode == 403 && e.code == null)) {
    return const AcceptFailure(message: OfferCopy.unavailable, offerGone: true);
  }
  return AcceptFailure(message: friendlyError(e));
}

/// Decline through the R-23 dialog with a required reason (row 229).
Future<DeclineReasonOutcome> declineOffer(
  BuildContext context,
  RunnerJobsRepository jobs,
  RunnerJobView o,
) => DeclineReasonDialog.show(
  context,
  overPurchaseLimit: o.overPurchaseLimit,
  onDecline: (reason) => jobs.decline(o.id, reason: reason),
);
