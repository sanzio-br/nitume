import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// A white card on the slate canvas with a hairline border — the design
/// system's primary surface (`nitume_design_system.html`).
class NitumeCard extends StatelessWidget {
  const NitumeCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(NitumeSpacing.md),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final border = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(NitumeRadii.medium),
      side: const BorderSide(color: NitumeColors.slateLine),
    );
    return Material(
      color: NitumeColors.white,
      borderRadius: BorderRadius.circular(NitumeRadii.medium),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(NitumeRadii.medium),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(NitumeRadii.medium),
            border: Border.all(color: NitumeColors.slateLine),
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

/// A small status chip. Colour is derived from the errand status per the
/// design system (slate / blue / green / amber / red).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.tone});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      StatusTone.neutral => (NitumeColors.slate, NitumeColors.slate600),
      StatusTone.info => (NitumeColors.blue050, NitumeColors.blue),
      StatusTone.success => (NitumeColors.green050, NitumeColors.green700),
      StatusTone.pending => (NitumeColors.amber050, NitumeColors.amber),
      StatusTone.danger => (NitumeColors.red050, NitumeColors.red),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(NitumeRadii.small),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: fg,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

enum StatusTone { neutral, info, success, pending, danger }

/// Maps an errand status to its chip label and tone.
({String label, StatusTone tone}) statusPresentation(ErrandStatus status) {
  return switch (status) {
    ErrandStatus.draft => (label: 'Draft', tone: StatusTone.neutral),
    ErrandStatus.requested => (label: 'Finding runner', tone: StatusTone.info),
    ErrandStatus.quoted => (label: 'Quote ready', tone: StatusTone.pending),
    ErrandStatus.accepted => (label: 'Accepted', tone: StatusTone.pending),
    ErrandStatus.paymentConfirmed =>
      (label: 'Paid', tone: StatusTone.success),
    ErrandStatus.runnerAssigned =>
      (label: 'Runner assigned', tone: StatusTone.info),
    ErrandStatus.runnerEnRoute =>
      (label: 'On the way', tone: StatusTone.info),
    ErrandStatus.arrived => (label: 'Arrived', tone: StatusTone.info),
    ErrandStatus.inProgress =>
      (label: 'In progress', tone: StatusTone.info),
    ErrandStatus.awaitingCustomer =>
      (label: 'Awaiting you', tone: StatusTone.pending),
    ErrandStatus.completed => (label: 'Completed', tone: StatusTone.success),
    ErrandStatus.confirmed => (label: 'Confirmed', tone: StatusTone.success),
    ErrandStatus.settled => (label: 'Settled', tone: StatusTone.success),
    ErrandStatus.cancelled => (label: 'Cancelled', tone: StatusTone.danger),
    ErrandStatus.failed => (label: 'Failed', tone: StatusTone.danger),
    ErrandStatus.expired => (label: 'Expired', tone: StatusTone.neutral),
    ErrandStatus.disputed => (label: 'In dispute', tone: StatusTone.danger),
  };
}