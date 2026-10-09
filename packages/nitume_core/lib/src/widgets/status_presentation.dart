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
ErrandStatusPresentation statusPresentation(ErrandStatus status) {
  return switch (status) {
    ErrandStatus.draft => (label: 'Draft', tone: StatusTone.info),
    ErrandStatus.requested => (label: 'Awaiting quote', tone: StatusTone.pending),
    ErrandStatus.quoted => (label: 'Quote ready', tone: StatusTone.pending),
    ErrandStatus.accepted => (label: 'Awaiting payment', tone: StatusTone.pending),
    ErrandStatus.paymentConfirmed =>
      (label: 'Finding a runner', tone: StatusTone.info),
    ErrandStatus.runnerAssigned =>
      (label: 'Runner assigned', tone: StatusTone.info),
    ErrandStatus.runnerEnRoute =>
      (label: 'En route', tone: NitumeDesignChoices.enRouteTone),
    ErrandStatus.arrived => (label: 'Arrived', tone: StatusTone.info),
    ErrandStatus.inProgress => (label: 'In progress', tone: StatusTone.info),
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
