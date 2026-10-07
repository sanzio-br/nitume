import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// One entry of a [StatusTimeline].
@immutable
class TimelineStep {
  const TimelineStep({required this.title, this.time, this.done = false});

  /// Fira Sans 12.5 title (e.g. a §6 state label).
  final String title;

  /// Fira Code 11 slate-600 line under the title (`10:03 AM`,
  /// `Expected 10:28 AM`, `Pending`).
  final String? time;

  /// Done = green dot; pending = slate-400 dot.
  final bool done;
}

/// C-19. Vertical status timeline (`.timeline`): 9px dots, 1px slate-line
/// connector, item gap 18, left padding 22.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({
    super.key,
    required this.steps,
    this.padding = const EdgeInsets.symmetric(horizontal: 20),
  });

  final List<TimelineStep> steps;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < steps.length; i++)
            _TimelineItem(step: steps[i], isLast: i == steps.length - 1),
        ],
      ),
    );
  }
}

class _TimelineItem extends StatelessWidget {
  const _TimelineItem({required this.step, required this.isLast});

  final TimelineStep step;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: [
        step.title,
        if (step.time != null) step.time!,
        step.done ? 'done' : 'pending',
      ].join(', '),
      excludeSemantics: true,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 22,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 2),
                  Container(
                    key: ValueKey(
                      step.done ? 'timeline-dot-done' : 'timeline-dot-pending',
                    ),
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: step.done
                          ? NitumeColors.green
                          : NitumeColors.slate400,
                    ),
                  ),
                  if (!isLast)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(left: 4, top: 1),
                        child: Container(
                          width: 1,
                          color: NitumeColors.slateLine,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: isLast ? 0 : 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step.title,
                      style: NitumeTextStyles.body.copyWith(fontSize: 12.5),
                    ),
                    if (step.time != null)
                      Text(step.time!, style: NitumeTextStyles.meta),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
