import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// R-10. Profile stat tile (`.stat-b`): white, slate-line border, card
/// radius, padding 12, centred; value Fira Code 16/600, label 10 upper-case
/// slate-600 Fira Sans.
///
/// [value] is already formatted (`137`, `formatRating(…)`, `98.7%`, or
/// `kMissingValue` for a new runner).
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.value,
    required this.label,
    this.semanticLabel,
  });

  final String value;
  final String label;

  /// Spoken text, e.g. `rating 4.9`; defaults to `value label`.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: semanticLabel ?? '$value ${label.toLowerCase()}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: NitumeColors.white,
          borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
          border: Border.all(color: NitumeColors.slateLine),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              value,
              textAlign: TextAlign.center,
              style: NitumeTypography.numeric(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label.toUpperCase(),
              textAlign: TextAlign.center,
              style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

/// R-10. Three [StatTile]s in equal columns with a 10px gap
/// (`.stat-row3`); tiles share the tallest tile's height.
class StatRow3 extends StatelessWidget {
  const StatRow3({
    super.key,
    required this.first,
    required this.second,
    required this.third,
  });

  final StatTile first;
  final StatTile second;
  final StatTile third;

  @override
  Widget build(BuildContext context) {
    final tiles = [first, second, third];
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: tiles[i]),
          ],
        ],
      ),
    );
  }
}
