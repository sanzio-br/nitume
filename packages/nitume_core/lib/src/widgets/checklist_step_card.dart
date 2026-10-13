import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'nitume_checkbox.dart';

/// R-07. Checklist step card (`.step-card` + `.check`) on the runner's
/// active job: white, card radius, 1px slate-line, padding 13/15, gap 12.
///
/// * Leading display-only C-36 check (green fill and white tick when
///   [done], a complete state).
/// * [title] 13/600 Fira Sans and an optional [subtitle] in Fira Code 11
///   slate-600 (`10:28 AM · GPS confirmed`, `3 photos uploaded`,
///   `Required`).
/// * Optional trailing C-02 small action ([actionLabel] + [onAction]:
///   `Upload`, `Add`, `Edit`). When present the whole card is tappable and
///   runs the same [onAction].
///
/// Reads as `Photos, Required, button Upload`, or `…, completed` when done.
class ChecklistStepCard extends StatelessWidget {
  const ChecklistStepCard({
    super.key,
    required this.title,
    this.subtitle,
    required this.done,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? subtitle;
  final bool done;
  final String? actionLabel;

  /// `null` hides the action (and makes the card non-tappable).
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    final hasAction = actionLabel != null && onAction != null;
    final label = [title, ?subtitle, if (done) 'completed'].join(', ');
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      child: Row(
        children: [
          ExcludeSemantics(
            child: NitumeCheckbox(value: done, onChanged: null, compact: true),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Semantics(
              label: label,
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: NitumeTextStyles.rowTitle.copyWith(fontSize: 13),
                  ),
                  if (subtitle != null)
                    Text(subtitle!, style: NitumeTextStyles.meta),
                ],
              ),
            ),
          ),
          if (hasAction) ...[
            const SizedBox(width: 12),
            NitumeButton.secondary(
              label: actionLabel!,
              size: NitumeButtonSize.small,
              onPressed: onAction,
            ),
          ],
        ],
      ),
    );
    return Material(
      color: NitumeColors.white,
      borderRadius: radius,
      child: InkWell(
        onTap: hasAction ? onAction : null,
        borderRadius: radius,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: NitumeColors.slateLine),
          ),
          child: content,
        ),
      ),
    );
  }
}
