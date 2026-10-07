import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-40. Inline notice (design-system `.card-demo`): white, slate-line
/// border, `--r-m` 14, 13 slate-600 text, optional leading slate-600 info
/// icon and an optional trailing [action] (a small `NitumeButton.outline`,
/// e.g. Track's item-payment notice). No coloured fill. Margin is the
/// caller's.
class NitumeNotice extends StatelessWidget {
  const NitumeNotice({
    super.key,
    required this.message,
    this.showIcon = true,
    this.action,
  });

  final String message;
  final bool showIcon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: NitumeColors.white,
        borderRadius: radius,
        border: Border.all(color: NitumeColors.slateLine),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (showIcon) ...[
            const Icon(
              Icons.info_outline_rounded,
              size: 18,
              color: NitumeColors.slate600,
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Semantics(
              liveRegion: true,
              child: Text(
                message,
                style: NitumeTextStyles.muted.copyWith(fontSize: 13),
              ),
            ),
          ),
          if (action != null) ...[const SizedBox(width: 10), action!],
        ],
      ),
    );
  }
}
