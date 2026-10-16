import '../models/enums.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/status_tone.dart';

/// C-06. Customer-facing label and chip tone for an errand state.
typedef ErrandStatusPresentation = ({String label, StatusTone tone});

/// Maps every §3.3 state to its customer label and chip tone.
///
/// The labels are the `docs/specs/customer/_shared.md` §6 table, which the
/// owner made authoritative (Q20 / Q-LABELS, decided): do not add alternate
/// customer-facing labels. Tones follow §6 with the Q13 decisions applied:
/// En route amber, Cancelled red (see [NitumeDesignChoices]).
///
/// CONFIRMED and SETTLED are system-only states (owner row 35): the customer
/// never sees them by name, so both display as `Completed`.
///
/// RUNNER_ASSIGNED means a runner has been offered the task, not that one
/// accepted (owner row 176): the customer keeps seeing `Finding a runner`
/// through an open offer, a decline, a lapse and a re-offer. Acceptance is
/// RUNNER_EN_ROUTE, which reads `En route` (row 182).
///
/// Customer app only. The Runner app uses `runnerStatusPresentation` (R-01)
/// and admin has its own chip map.
ErrandStatusPresentation statusPresentation(ErrandStatus status) {
  return switch (status) {
    ErrandStatus.draft => (label: 'Draft', tone: StatusTone.info),
    ErrandStatus.requested => (label: 'Awaiting quote', tone: StatusTone.pending),
    ErrandStatus.quoted => (label: 'Quote ready', tone: StatusTone.pending),
    ErrandStatus.accepted => (label: 'Awaiting payment', tone: StatusTone.pending),
    ErrandStatus.paymentConfirmed =>
      (label: 'Finding a runner', tone: StatusTone.info),
    ErrandStatus.runnerAssigned =>
      (label: 'Finding a runner', tone: StatusTone.info),
    ErrandStatus.runnerEnRoute =>
      (label: 'En route', tone: NitumeDesignChoices.enRouteTone),
    ErrandStatus.arrived => (label: 'Arrived', tone: StatusTone.info),
    ErrandStatus.inProgress => (label: 'In progress', tone: StatusTone.info),
    ErrandStatus.awaitingCustomer =>
      (label: 'Needs your review', tone: StatusTone.pending),
    ErrandStatus.completed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.confirmed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.settled => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.cancelled =>
      (label: 'Cancelled', tone: NitumeDesignChoices.cancelledTone),
    ErrandStatus.failed => (label: 'Failed', tone: StatusTone.danger),
    ErrandStatus.expired =>
      (label: 'Expired', tone: NitumeDesignChoices.expiredTone),
    ErrandStatus.disputed => (label: 'Disputed', tone: StatusTone.danger),
  };
}

/// C-19. Customer timeline step title for a status history row.
///
/// Customer app only (`_shared.md` §6.1, owner rows 176 and 182):
/// - RUNNER_ASSIGNED returns `null`: the offer step is hidden, since it
///   would repeat `Finding a runner` and re-offers would add more rows.
/// - RUNNER_EN_ROUTE returns `Runner assigned`: the acceptance step.
/// - Every other state returns its [statusPresentation] label.
String? customerTimelineTitle(ErrandStatus status) {
  return switch (status) {
    ErrandStatus.runnerAssigned => null,
    ErrandStatus.runnerEnRoute => 'Runner assigned',
    _ => statusPresentation(status).label,
  };
}
