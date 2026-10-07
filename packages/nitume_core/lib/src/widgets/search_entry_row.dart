import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-34. Search entry row (`.search-row`): white, slate-line border, slate-400
/// search icon and 13.5 placeholder. A button, not a text field (what it
/// opens is v-home Q2).
class SearchEntryRow extends StatelessWidget {
  const SearchEntryRow({
    super.key,
    required this.placeholder,
    required this.onTap,
  });

  final String placeholder;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    return Semantics(
      button: true,
      label: placeholder,
      excludeSemantics: true,
      child: Material(
        color: NitumeColors.white,
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(color: NitumeColors.slateLine),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.search_rounded,
                  size: 15,
                  color: NitumeColors.slate400,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    placeholder,
                    style: NitumeTextStyles.body.copyWith(
                      color: NitumeColors.slate400,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
