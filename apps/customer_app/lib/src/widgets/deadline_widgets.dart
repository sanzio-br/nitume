import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../util/display.dart';

/// `Flexible` caption (`v-new-details`, rows 221, 235): 12 slate-600 with
/// the duration in Fira Code. Shown on the wizard step and in the
/// new-deadline sheet; hidden by the caller when the API sent no value.
class FlexibleDeadlineCaption extends StatelessWidget {
  const FlexibleDeadlineCaption({super.key, required this.duration});

  final Duration duration;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: "No fixed time. Your task's deadline is "),
            NumSpan(formatHours(duration)),
            const TextSpan(text: ' after your payment is confirmed.'),
          ],
        ),
        style: NitumeTextStyles.muted.copyWith(fontSize: 12),
      ),
    );
  }
}

/// The `Flexible` caption's duration from `GET /errands/defaults`, or
/// `null` to hide it: the API must send the length and say the clock starts
/// at payment confirmation (rows 221, 235).
Duration? flexibleDeadlineDefault(ErrandDefaults? defaults) {
  if (defaults?.defaultDeadlineStartsAt !=
      DeadlineClockStart.paymentConfirmed) {
    return null;
  }
  return defaults?.defaultDeadline;
}

/// `Deadline` line in the checkout task summary (`x-awaiting-quote`, rows
/// 239 (a), 244): the chosen time (12-hour EAT, Fira Code), or the
/// no-deadline-yet line for a `Flexible` task, with an optional C-04
/// `Change`.
class DeadlineLine extends StatelessWidget {
  const DeadlineLine({super.key, required this.errand, this.onChange});

  final Errand errand;

  /// `null` hides `Change`.
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final at = errand.deadlineAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        const Divider(height: 1, color: NitumeColors.slateLine),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: Text('Deadline', style: NitumeTextStyles.rowTitle)),
            if (onChange != null)
              NitumeButton.link(label: 'Change', onPressed: onChange),
          ],
        ),
        const SizedBox(height: 4),
        if (errand.hasNoDeadlineYet || at == null)
          Text(
            'No deadline yet. It starts when your payment is confirmed.',
            style: NitumeTextStyles.muted,
          )
        else
          Text(formatDayTimeEat(at), style: NitumeTextStyles.metaLarge),
      ],
    );
  }
}
