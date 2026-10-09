import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';

/// How a [CopyableValueRow] renders its value.
enum CopyableValueStyle {
  /// Fira Code 16/600: Till, Paybill and account numbers.
  number,

  /// Fira Code 20/600 (`.t-num`): the amount.
  amount,

  /// Fira Sans 15/600: names (merchant name).
  text,
}

/// C-39. Copyable value row (`x-merchant-payment`): label 12.5 slate-600
/// above a selectable value, trailing `Copy` text button. Copy puts
/// [copyValue] (defaults to [value]) on the clipboard and shows the snackbar
/// `Copied`. Padding 12 0; separate rows with hairlines in the parent card.
///
/// [copyable] `false` hides the button (merchant name, the send-to-runner
/// amount).
class CopyableValueRow extends StatelessWidget {
  const CopyableValueRow({
    super.key,
    required this.label,
    required this.value,
    this.copyValue,
    this.style = CopyableValueStyle.number,
    this.copyable = true,
  });

  final String label;
  final String value;

  /// What lands on the clipboard, e.g. digits only (`40000`) for `KSh 40,000`.
  final String? copyValue;
  final CopyableValueStyle style;
  final bool copyable;

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    await Clipboard.setData(ClipboardData(text: copyValue ?? value));
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Copied')));
  }

  @override
  Widget build(BuildContext context) {
    final valueStyle = switch (style) {
      CopyableValueStyle.number => NitumeTypography.numeric(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      CopyableValueStyle.amount => NitumeTextStyles.amount,
      CopyableValueStyle.text => NitumeTextStyles.rowTitle.copyWith(
        fontSize: 15,
      ),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: NitumeTextStyles.body.copyWith(
                    fontSize: 12.5,
                    color: NitumeColors.slate600,
                  ),
                ),
                const SizedBox(height: 2),
                SelectableText(value, style: valueStyle),
              ],
            ),
          ),
          if (copyable)
            Semantics(
              label: 'Copy $label',
              button: true,
              excludeSemantics: true,
              child: NitumeButton.text(
                label: 'Copy',
                size: NitumeButtonSize.small,
                onPressed: () => _copy(context),
              ),
            ),
        ],
      ),
    );
  }
}
