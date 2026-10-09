import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// C-10. Header of a pushed screen (`.ov-header`): 32px circular back button
/// (48dp hit area), optional 18/700 title and optional Fira Code step counter
/// (`Step 1 of 3`) on the right.
///
/// Implements [PreferredSizeWidget] so it can be a `Scaffold.appBar`; it
/// applies the top safe-area inset itself.
class NitumePushedHeader extends StatelessWidget implements PreferredSizeWidget {
  const NitumePushedHeader({
    super.key,
    this.title,
    this.onBack,
    this.step,
    this.totalSteps,
    this.showBack = true,
  }) : assert(
          (step == null) == (totalSteps == null),
          'step and totalSteps go together',
        );

  final String? title;

  /// Defaults to `Navigator.maybePop`.
  final VoidCallback? onBack;
  final int? step;
  final int? totalSteps;
  final bool showBack;

  // 48 hit area + 2 top + 6 bottom keeps the 32px circle at `10 20 14`.
  static const double _height = 56;

  @override
  Size get preferredSize => const Size.fromHeight(_height);

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: NitumeColors.slate,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: _height,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 2, 20, 6),
            child: Row(
              children: [
                if (showBack)
                  NitumeBackButton(
                    onPressed: onBack ?? () => Navigator.maybePop(context),
                  )
                else
                  const SizedBox(width: 8),
                if (title != null) ...[
                  const SizedBox(width: 4),
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        title!,
                        style: NitumeTextStyles.pushedTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ] else
                  const Spacer(),
                if (step != null)
                  Text(
                    'Step $step of $totalSteps',
                    style: NitumeTypography.numeric(
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: NitumeColors.slate600,
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

/// The 32px white circular back button (`.ov-back`) with a 48dp hit area.
class NitumeBackButton extends StatelessWidget {
  const NitumeBackButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: MaterialLocalizations.of(context).backButtonTooltip,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onPressed,
        radius: 24,
        child: SizedBox.square(
          dimension: NitumeSpacing.minTapTarget,
          child: Center(
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: NitumeColors.white,
                shape: BoxShape.circle,
                border: Border.all(color: NitumeColors.slateLine),
              ),
              child: const Icon(
                Icons.arrow_back,
                size: 16,
                color: NitumeColors.blue,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
