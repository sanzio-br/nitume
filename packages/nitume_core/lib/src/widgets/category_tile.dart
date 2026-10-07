import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// Icon for each task category. One place, so a design change flips here.
/// The mockup draws emoji; these are the Material equivalents.
IconData categoryIcon(ErrandCategory category) => switch (category) {
      ErrandCategory.buyForMe => Icons.shopping_bag_outlined,
      ErrandCategory.getItForMe => Icons.local_shipping_outlined,
      ErrandCategory.checkItForMe => Icons.fact_check_outlined,
      ErrandCategory.goThereForMe => Icons.place_outlined,
      ErrandCategory.waitForMe => Icons.hourglass_empty_rounded,
      ErrandCategory.businessTasks => Icons.business_center_outlined,
    };

/// C-15. Category tile (`.cat-tile`): white, slate-line border, 32px green-050
/// icon box, label 11.5/600 (the full display name, Q1 pending). Selected:
/// green border plus a 2px inset green-050 ring.
class CategoryTile extends StatelessWidget {
  const CategoryTile({
    super.key,
    required this.category,
    required this.onTap,
    this.selected = false,
  });

  final ErrandCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const radius = NitumeDesignChoices.cardRadius;
    final inner = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: NitumeColors.green050,
              borderRadius:
                  BorderRadius.circular(NitumeDesignChoices.innerBoxRadius),
            ),
            child: Icon(
              categoryIcon(category),
              size: 16,
              color: NitumeColors.green700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            category.label,
            textAlign: TextAlign.center,
            maxLines: 2,
            style: NitumeTextStyles.rowTitle.copyWith(fontSize: 11.5),
          ),
        ],
      ),
    );

    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: category.label,
      excludeSemantics: true,
      child: Material(
        color: NitumeColors.white,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(
                color: selected ? NitumeColors.green : NitumeColors.slateLine,
              ),
            ),
            child: DecoratedBox(
              position: DecorationPosition.foreground,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(radius),
                border: selected
                    ? Border.all(color: NitumeColors.green050, width: 3)
                    : null,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Center(child: inner),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// C-15 grid (`.cat-grid2`): 3 columns, gap 10, equal-height rows, padding
/// `0 20 20`. Shows [categories] in order (defaults to all six).
class CategoryGrid extends StatelessWidget {
  const CategoryGrid({
    super.key,
    required this.onSelected,
    this.selected,
    this.categories = ErrandCategory.values,
    this.padding = const EdgeInsets.fromLTRB(20, 0, 20, 20),
  });

  final ErrandCategory? selected;
  final ValueChanged<ErrandCategory> onSelected;
  final List<ErrandCategory> categories;
  final EdgeInsetsGeometry padding;

  static const _columns = 3;
  static const _gap = 10.0;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var start = 0; start < categories.length; start += _columns) {
      final slice = categories.skip(start).take(_columns).toList();
      if (rows.isNotEmpty) rows.add(const SizedBox(height: _gap));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < _columns; i++) ...[
                if (i > 0) const SizedBox(width: _gap),
                Expanded(
                  child: i < slice.length
                      ? CategoryTile(
                          category: slice[i],
                          selected: slice[i] == selected,
                          onTap: () => onSelected(slice[i]),
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: padding,
      child: Column(mainAxisSize: MainAxisSize.min, children: rows),
    );
  }
}
