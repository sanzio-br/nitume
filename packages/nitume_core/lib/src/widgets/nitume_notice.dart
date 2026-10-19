import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'num_text.dart';

/// C-40. Inline notice (design-system `.card-demo`): white, slate-line
/// border, `--r-m` 14, 13 slate-600 text, optional leading slate-600 info
/// icon and an optional trailing [action] (a small `NitumeButton.outline`,
/// e.g. Track's item-payment notice). No coloured fill. Margin is the
/// caller's.
///
/// [tone] [NitumeNoticeTone.danger] (a failed action: `This photo is larger
/// than 10 MB.`) swaps the icon for a red error icon, always shown. Red
/// stays a small accent (design system: never a surface larger than a
/// chip); the card, border and text are unchanged.
class NitumeNotice extends StatelessWidget {
  const NitumeNotice({
    super.key,
    required this.message,
    this.richMessage,
    this.showIcon = true,
    this.action,
    this.tone = NitumeNoticeTone.info,
  });

  /// Plain-text message. Also the accessible label when [richMessage] is
  /// set, so keep the two identical in wording.
  final String message;

  /// Optional rich version of [message], drawn instead of it. Build numeric
  /// parts with [NumSpan] (`Pay the item amount: KSh 40,000`).
  final InlineSpan? richMessage;
  final bool showIcon;
  final Widget? action;

  /// Info (default) or the danger accent.
  final NitumeNoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    final style = NitumeTextStyles.muted.copyWith(fontSize: 13);
    final danger = tone == NitumeNoticeTone.danger;
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
          if (danger)
            const Padding(
              padding: EdgeInsets.only(right: 10),
              child: Icon(
                Icons.error_outline_rounded,
                size: 18,
                color: NitumeColors.red,
              ),
            )
          else if (showIcon) ...[
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
              child: richMessage == null
                  ? Text(message, style: style)
                  : Text.rich(
                      richMessage!,
                      style: style,
                      semanticsLabel: message,
                    ),
            ),
          ),
          if (action != null) ...[const SizedBox(width: 10), action!],
        ],
      ),
    );
  }
}

/// Accent of a [NitumeNotice].
enum NitumeNoticeTone {
  /// Slate-600 info icon (or none).
  info,

  /// Red error icon (the danger status accent, `--red`).
  danger,
}
