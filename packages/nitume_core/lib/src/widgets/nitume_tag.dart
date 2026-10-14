import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../theme/status_tone.dart';

/// R-14. Display-only label in the design-system `.chip-info` colours
/// (blue text on blue-050), pill, no dot, 11/600, padding 6/11.
///
/// For category names on job offers and skills / service areas on the
/// runner profile. Never green: a category is not an action, toggle or
/// complete state (`docs/specs/runner/_shared.md` §2). Not tappable; for
/// selection use `NitumeChoiceChip`.
class NitumeTag extends StatelessWidget {
  const NitumeTag(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = StatusToneColors.of(StatusTone.info);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(NitumeRadii.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: NitumeTextStyles.chip.copyWith(
            fontSize: 11,
            color: colors.label,
          ),
        ),
      ),
    );
  }
}
