import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// One destination in a [NitumeTabBar].
@immutable
class NitumeTabItem {
  const NitumeTabItem({
    required this.icon,
    required this.label,
    this.activeIcon,
  });

  final IconData icon;
  final IconData? activeIcon;
  final String label;
}

/// C-13. Bottom tab bar (`.tabbar`): white, top hairline, every label shown
/// (10/700), inactive slate-400, active green-700, no indicator.
///
/// Tapping an item calls [onTap]; the host decides whether it switches a
/// root view or pushes a screen (the customer "New task" item pushes).
class NitumeTabBar extends StatelessWidget {
  const NitumeTabBar({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<NitumeTabItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: NitumeColors.white,
        border: Border(top: BorderSide(color: NitumeColors.slateLine)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _Tab(
                    item: items[i],
                    selected: i == currentIndex,
                    index: i,
                    count: items.length,
                    onTap: () => onTap(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.item,
    required this.selected,
    required this.index,
    required this.count,
    required this.onTap,
  });

  final NitumeTabItem item;
  final bool selected;
  final int index;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? NitumeColors.green700 : NitumeColors.slate400;
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      hint: 'Tab ${index + 1} of $count',
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        containedInkWell: true,
        highlightShape: BoxShape.rectangle,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? (item.activeIcon ?? item.icon) : item.icon,
                size: 21,
                color: color,
              ),
              const SizedBox(height: 4),
              Text(
                item.label,
                style: NitumeTextStyles.tabLabel.copyWith(color: color),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
