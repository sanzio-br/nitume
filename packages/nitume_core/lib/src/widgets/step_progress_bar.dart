import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';

/// C-14. Wizard stepper (`.stepper`): [total] 4px pill segments, gap 6;
/// the first [completed] are green, the rest slate-line.
class StepProgressBar extends StatelessWidget {
  const StepProgressBar({
    super.key,
    required this.total,
    required this.completed,
    this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 16),
  })  : assert(total > 0),
        assert(completed >= 0 && completed <= total);

  final int total;
  final int completed;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Step $completed of $total',
      excludeSemantics: true,
      child: Padding(
        padding: padding,
        child: Row(
          children: [
            for (var i = 0; i < total; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: Container(
                  key: ValueKey('step-segment-$i'),
                  height: 4,
                  decoration: BoxDecoration(
                    color: i < completed
                        ? NitumeColors.green
                        : NitumeColors.slateLine,
                    borderRadius: BorderRadius.circular(NitumeRadii.pill),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
