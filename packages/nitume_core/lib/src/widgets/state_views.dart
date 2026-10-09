import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';

/// C-33. Empty state: centred muted message and an optional primary action
/// (`No tasks yet.` + `Start a new task`).
class NitumeEmptyState extends StatelessWidget {
  const NitumeEmptyState({
    super.key,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.padding = const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, textAlign: TextAlign.center, style: NitumeTextStyles.muted),
          if (actionLabel != null) ...[
            const SizedBox(height: 16),
            NitumeButton.primary(label: actionLabel!, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}

/// C-33. Error state: centred muted message and an outline retry button
/// (`Couldn't load your tasks.` + `Try again`).
class NitumeErrorState extends StatelessWidget {
  const NitumeErrorState({
    super.key,
    required this.message,
    required this.onRetry,
    this.retryLabel = 'Try again',
    this.padding = const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
  });

  final String message;
  final VoidCallback onRetry;
  final String retryLabel;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Semantics(
            liveRegion: true,
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: NitumeTextStyles.muted,
            ),
          ),
          const SizedBox(height: 16),
          NitumeButton.outline(label: retryLabel, onPressed: onRetry),
        ],
      ),
    );
  }
}

/// C-33. Static loading placeholder shaped like a card: white, slate-line
/// border, two slate bars.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.height = 72});

  final double height;

  @override
  Widget build(BuildContext context) {
    Widget bar(double widthFactor, double h) => FractionallySizedBox(
          widthFactor: widthFactor,
          alignment: Alignment.centerLeft,
          child: Container(
            height: h,
            decoration: BoxDecoration(
              color: NitumeColors.slate,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        );
    return Semantics(
      label: 'Loading',
      child: Container(
        height: height,
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        decoration: BoxDecoration(
          color: NitumeColors.white,
          borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
          border: Border.all(color: NitumeColors.slateLine),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [bar(0.6, 12), const SizedBox(height: 8), bar(0.35, 10)],
        ),
      ),
    );
  }
}
