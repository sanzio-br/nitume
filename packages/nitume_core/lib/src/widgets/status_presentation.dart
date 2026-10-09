import '../models/enums.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/status_tone.dart';

/// C-06. Customer-facing label and chip tone for an errand state.
typedef ErrandStatusPresentation = ({String label, StatusTone tone});

/// Maps every §3.3 state to its customer label and chip tone
/// (`docs/specs/customer/_shared.md` §6).
///
/// Labels are the spec's recommended copy and are **pending owner
/// confirmation** (gap report Q20 / Q-LABELS). Tones for runner-progress,
/// CANCELLED and EXPIRED come from [NitumeDesignChoices] (Q13).
ErrandStatusPresentation statusPresentation(ErrandStatus status) {
  const progress = NitumeDesignChoices.runnerProgressTone;
  return switch (status) {
    ErrandStatus.draft => (label: 'Draft', tone: StatusTone.info),
    ErrandStatus.requested => (label: 'Awaiting quote', tone: StatusTone.pending),
    ErrandStatus.quoted => (label: 'Quote ready', tone: StatusTone.pending),
    ErrandStatus.accepted => (label: 'Awaiting payment', tone: StatusTone.pending),
    ErrandStatus.paymentConfirmed =>
      (label: 'Finding a runner', tone: StatusTone.info),
    ErrandStatus.runnerAssigned => (label: 'Runner assigned', tone: progress),
    ErrandStatus.runnerEnRoute => (label: 'En route', tone: progress),
    ErrandStatus.arrived => (label: 'Arrived', tone: progress),
    ErrandStatus.inProgress => (label: 'In progress', tone: progress),
    ErrandStatus.awaitingCustomer =>
      (label: 'Needs your review', tone: StatusTone.pending),
    ErrandStatus.completed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.confirmed => (label: 'Confirmed', tone: StatusTone.success),
    ErrandStatus.settled => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.cancelled =>
      (label: 'Cancelled', tone: NitumeDesignChoices.cancelledTone),
    ErrandStatus.failed => (label: 'Failed', tone: StatusTone.danger),
    ErrandStatus.expired =>
      (label: 'Expired', tone: NitumeDesignChoices.expiredTone),
    ErrandStatus.disputed => (label: 'Disputed', tone: StatusTone.danger),
  };
}
