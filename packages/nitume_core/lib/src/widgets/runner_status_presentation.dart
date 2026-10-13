import '../models/enums.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/status_tone.dart';
import 'status_presentation.dart';

/// R-01. Runner-facing label and chip tone for an errand state
/// (`docs/specs/runner/_shared.md` §6).
///
/// Separate from the customer map [statusPresentation] (C-06), which must
/// not change. Pass the result to `StatusChip(label:, tone:)`.
///
/// [offerAccepted] matters only for RUNNER_ASSIGNED: while this runner's
/// assignment is still an offer (RQ-1) the state reads `New offer`; once
/// accepted it reads `Accepted`.
///
/// Returns `null` for DRAFT, REQUESTED, QUOTED and ACCEPTED: states before
/// PAYMENT_CONFIRMED never reach the runner (§6), so the runner surface has
/// no label for them. Render nothing rather than inventing one.
ErrandStatusPresentation? runnerStatusPresentation(
  ErrandStatus status, {
  bool offerAccepted = true,
}) {
  return switch (status) {
    ErrandStatus.draft ||
    ErrandStatus.requested ||
    ErrandStatus.quoted ||
    ErrandStatus.accepted => null,
    ErrandStatus.paymentConfirmed => (
      label: 'New offer',
      tone: StatusTone.info,
    ),
    ErrandStatus.runnerAssigned =>
      offerAccepted
          ? (label: 'Accepted', tone: StatusTone.info)
          : (label: 'New offer', tone: StatusTone.info),
    ErrandStatus.runnerEnRoute => (
      label: 'On the way',
      tone: NitumeDesignChoices.enRouteTone,
    ),
    ErrandStatus.arrived => (label: 'Arrived', tone: StatusTone.info),
    ErrandStatus.inProgress => (label: 'In progress', tone: StatusTone.info),
    ErrandStatus.awaitingCustomer => (
      label: 'Waiting for the customer',
      tone: StatusTone.pending,
    ),
    ErrandStatus.completed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.confirmed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.settled => (label: 'Paid', tone: StatusTone.success),
    ErrandStatus.cancelled => (
      label: 'Cancelled',
      tone: NitumeDesignChoices.cancelledTone,
    ),
    ErrandStatus.failed => (label: 'Failed', tone: StatusTone.danger),
    ErrandStatus.expired => (
      label: 'Expired',
      tone: NitumeDesignChoices.expiredTone,
    ),
    ErrandStatus.disputed => (label: 'Disputed', tone: StatusTone.danger),
  };
}
