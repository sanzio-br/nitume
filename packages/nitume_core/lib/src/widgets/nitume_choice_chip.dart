import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// C-16. Selectable chip (extension of the design-system `.chip`): pill,
/// slate fill, slate-line border, 12/600 blue text; selected = blue fill with
/// white text. 48dp hit area.
///
/// [expand] stretches it to full width with left-aligned text (the stacked
/// payment-flow choice on `v-new-review`).
class NitumeChoiceChip extends StatelessWidget {
  const NitumeChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onSelected,
    this.expand = false,
  });

  final String label;
  final bool selected;
  final VoidCallback? onSelected;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final chip = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: expand ? double.infinity : null,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      decoration: BoxDecoration(
        color: selected ? NitumeColors.blue : NitumeColors.slate,
        borderRadius: BorderRadius.circular(NitumeRadii.pill),
        border: Border.all(
          color: selected ? NitumeColors.blue : NitumeColors.slateLine,
        ),
      ),
      child: Text(
        label,
        textAlign: expand ? TextAlign.start : TextAlign.center,
        style: NitumeTextStyles.chip.copyWith(
          color: selected ? NitumeColors.white : NitumeColors.blue,
        ),
      ),
    );

    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onSelected,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: NitumeSpacing.minTapTarget,
          ),
          child: Align(
            alignment: expand ? Alignment.centerLeft : Alignment.center,
            widthFactor: expand ? null : 1,
            child: chip,
          ),
        ),
      ),
    );
  }
}

/// C-16 radio-row variant (merchant payment route on `x-awaiting-quote`):
/// full-width pill, slate fill, slate-line border, 12/600 left-aligned
/// [label] and an optional 11.5 [subtitle]. Selected = blue fill, white
/// label and subtitle; otherwise blue label, slate-600 subtitle.
///
/// [onSelected] `null` disables the row: slate-400 text, no tap; the
/// [subtitle] should say why (it is part of the announced label). Stack rows
/// with a gap of 8; they form one radio group.
class NitumeRadioRow extends StatelessWidget {
  const NitumeRadioRow({
    super.key,
    required this.label,
    required this.selected,
    required this.onSelected,
    this.subtitle,
  });

  final String label;
  final String? subtitle;
  final bool selected;
  final VoidCallback? onSelected;

  @override
  Widget build(BuildContext context) {
    final enabled = onSelected != null;
    final active = selected && enabled;
    final labelColor = !enabled
        ? NitumeColors.slate400
        : active
        ? NitumeColors.white
        : NitumeColors.blue;
    final subtitleColor = !enabled
        ? NitumeColors.slate400
        : active
        ? NitumeColors.white
        : NitumeColors.slate600;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: active,
      enabled: enabled,
      button: true,
      label: [label, ?subtitle].join('. '),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onSelected,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: double.infinity,
          constraints: const BoxConstraints(
            minHeight: NitumeSpacing.minTapTarget,
          ),
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: active ? NitumeColors.blue : NitumeColors.slate,
            borderRadius: BorderRadius.circular(NitumeRadii.pill),
            border: Border.all(
              color: active ? NitumeColors.blue : NitumeColors.slateLine,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: NitumeTextStyles.chip.copyWith(color: labelColor),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: NitumeTextStyles.mutedSmall.copyWith(
                    color: subtitleColor,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
