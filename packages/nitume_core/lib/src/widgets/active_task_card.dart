import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'status_chip.dart';

/// C-20. Active task hero card (`.active-card`): blue fill, padding 18, a tag
/// chip, white 15.5/600 title, Fira Code 12 meta, and an intrinsic-width
/// green action button.
///
/// Tag tone and meta colour replace off-palette mockup values and come from
/// [NitumeDesignChoices] (Q14).
class ActiveTaskCard extends StatelessWidget {
  const ActiveTaskCard({
    super.key,
    required this.tagLabel,
    required this.title,
    required this.actionLabel,
    required this.onAction,
    this.reference,
    this.meta,
    this.onTap,
  });

  /// Category display name, e.g. `Check It For Me`.
  final String tagLabel;

  /// Optional task reference in Fira Code (`#10482`, pending Q15).
  final String? reference;
  final String title;

  /// Whole line in Fira Code (`Brian K. is en route · ETA 12 min`).
  final String? meta;
  final String actionLabel;
  final VoidCallback? onAction;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    return Material(
      color: NitumeColors.blue,
      borderRadius: radius,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(
                label: tagLabel,
                numericSuffix: reference,
                tone: NitumeDesignChoices.activeCardTagTone,
                size: StatusChipSize.compact,
              ),
              const SizedBox(height: 10),
              Text(
                title,
                style: NitumeTextStyles.cardTitle.copyWith(
                  color: NitumeColors.white,
                ),
              ),
              const SizedBox(height: 4),
              if (meta != null)
                Text(
                  meta!,
                  style: NitumeTypography.numeric(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: NitumeDesignChoices.activeCardMeta,
                  ),
                ),
              const SizedBox(height: 14),
              NitumeButton.primary(
                label: actionLabel,
                onPressed: onAction,
                size: NitumeButtonSize.small,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
