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
