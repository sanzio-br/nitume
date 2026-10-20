import 'app_notification.dart';
import 'enums.dart';

/// Runner job notification types (RA-6, row 139). The feed shows the API's
/// title and body as sent; every one carries `errandId` for the deep link
/// (`v-active` / `v-job-summary`).
///
/// The three new wire values are not [NotificationEventType] values:
/// adding enum values would break the apps' exhaustive switches (as
/// `errand.EXPIRED`), so [NotificationEventType.tryFromWire] gives `null`
/// for them. Read [RunnerNotificationReading.runnerKind] first.
abstract final class RunnerNotificationEvents {
  /// Ops resolved the dispute on a job the runner held.
  static const disputeResolved = 'dispute.resolved';

  /// The customer approved the runner's price change.
  static const priceChangeApproved = 'price_change.approved';

  /// An admin rejected the runner's price change; the task continues at the
  /// original amount (row 55).
  static const priceChangeRejected = 'price_change.rejected';
}

/// What a runner job notification is about. Switch with a wildcard arm:
/// more kinds may be added.
enum RunnerNotificationKind {
  /// `errand.CANCELLED`.
  jobCancelled,

  /// `errand.FAILED`.
  jobFailed,

  /// `errand.COMPLETED`: for a runner this is "Customer confirmed the job".
  jobConfirmed,

  /// `errand.DISPUTED`: the customer reported a problem.
  jobDisputed,

  /// [RunnerNotificationEvents.disputeResolved].
  disputeResolved,

  /// [RunnerNotificationEvents.priceChangeApproved].
  priceChangeApproved,

  /// [RunnerNotificationEvents.priceChangeRejected].
  priceChangeRejected,
}

/// Runner reading of an [AppNotification].
extension RunnerNotificationReading on AppNotification {
  /// The runner job kind of this notification; `null` for anything else
  /// (offers, verification, payouts …).
  RunnerNotificationKind? get runnerKind => switch (eventType) {
    RunnerNotificationEvents.disputeResolved =>
      RunnerNotificationKind.disputeResolved,
    RunnerNotificationEvents.priceChangeApproved =>
      RunnerNotificationKind.priceChangeApproved,
    RunnerNotificationEvents.priceChangeRejected =>
      RunnerNotificationKind.priceChangeRejected,
    _ => switch (event) {
      NotificationEventType.cancelled => RunnerNotificationKind.jobCancelled,
      NotificationEventType.failed => RunnerNotificationKind.jobFailed,
      NotificationEventType.completed => RunnerNotificationKind.jobConfirmed,
      NotificationEventType.disputed => RunnerNotificationKind.jobDisputed,
      _ => null,
    },
  };
}
