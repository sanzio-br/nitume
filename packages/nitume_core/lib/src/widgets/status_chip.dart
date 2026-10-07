import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../theme/status_tone.dart';
import 'status_presentation.dart';

/// Size variants of [StatusChip].
enum StatusChipSize {
  /// Design-system `.chip`: 12/600, padding 5/11, 6px dot.
  regular,

  /// Card tag (`.active-card .tag`): 11/700, padding 4/9, no dot.
  compact,

  /// Small tag (`.addr-tag`, "Default"): 10/700, padding 3/8, no dot.
  tag,
}

/// C-05. Design-system status chip: pill, tinted background, optional dot.
///
/// Colours come only from [StatusToneColors]; never tint a colour per screen.
class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    required this.tone,
    this.size = StatusChipSize.regular,
    this.showDot,
    this.numericSuffix,
  });

  /// Chip for an errand state, using [statusPresentation].
  factory StatusChip.forStatus(
    ErrandStatus status, {
    Key? key,
    StatusChipSize size = StatusChipSize.regular,
  }) {
    final p = statusPresentation(status);
    return StatusChip(key: key, label: p.label, tone: p.tone, size: size);
  }

  final String label;
  final StatusTone tone;
  final StatusChipSize size;

  /// Defaults to `true` for [StatusChipSize.regular], `false` otherwise.
  final bool? showDot;

  /// Optional numeric part rendered in Fira Code after ` · `
  /// (e.g. the task reference in `Check It For Me · #10482`).
  final String? numericSuffix;

  @override
  Widget build(BuildContext context) {
    final colors = StatusToneColors.of(tone);
    final (fontSize, weight, padding) = switch (size) {
      StatusChipSize.regular => (
          12.0,
          FontWeight.w600,
          const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
        ),
      StatusChipSize.compact => (
          11.0,
          FontWeight.w700,
          const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        ),
      StatusChipSize.tag => (
          10.0,
          FontWeight.w700,
          const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        ),
    };
    final dot = showDot ?? size == StatusChipSize.regular;
    final textStyle = NitumeTextStyles.chip.copyWith(
      fontSize: fontSize,
      fontWeight: weight,
      color: colors.label,
    );

    final text = numericSuffix == null
        ? Text(label, style: textStyle, maxLines: 1)
        : Text.rich(
            TextSpan(
              text: '$label · ',
              style: textStyle,
              children: [
                TextSpan(
                  text: numericSuffix,
                  style: NitumeTypography.numeric(
                    fontSize: fontSize,
                    fontWeight: weight,
                    color: colors.label,
                  ),
                ),
              ],
            ),
            maxLines: 1,
          );

    return Semantics(
      container: true,
      label: numericSuffix == null ? label : '$label $numericSuffix',
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.background,
          borderRadius: BorderRadius.circular(NitumeRadii.pill),
        ),
        child: Padding(
          padding: padding,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (dot) ...[
                Container(
                  key: const ValueKey('status-chip-dot'),
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: colors.dot,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Flexible(child: text),
            ],
          ),
        ),
      ),
    );
  }
}
