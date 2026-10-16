import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_button.dart';

/// One action on a [BalanceCard]: drawn as a C-03 small outline button.
typedef BalanceCardAction = ({String label, VoidCallback? onPressed});

/// R-08. Payout-ledger balance card (`.bal-card`): blue, card radius,
/// padding 20.
///
/// The amount is a **view of the payout ledger** computed by the API, never
/// a stored wallet (OA-6): no wallet or escrow words in [label] or
/// [subLines].
///
/// * [label] 11.5 blue-050 Fira Sans, with an optional info icon button
///   ([onInfo], 48dp hit, top right) that opens the explanation dialog.
/// * [amount] Fira Code 30/600 white (`formatKes`).
/// * Up to two [subLines] in Fira Code 11.5 blue-050
///   (`KSh 2,450 pending confirmation`, `KSh 5,000 on hold`).
/// * Optional [actions] (`Request payout`, `Payout history`): C-03 small
///   outline buttons (white fill, slate-line border, blue text), equal
///   width, gap 10. The mockup's translucent buttons are not used (OA-14).
class BalanceCard extends StatelessWidget {
  const BalanceCard({
    super.key,
    this.label = 'Available balance',
    required this.amount,
    this.subLines = const [],
    this.onInfo,
    this.actions = const [],
  });

  final String label;

  /// [num] or API decimal string.
  final Object amount;
  final List<String> subLines;
  final VoidCallback? onInfo;
  final List<BalanceCardAction> actions;

  @override
  Widget build(BuildContext context) {
    final labelStyle = NitumeTextStyles.mutedSmall.copyWith(
      color: NitumeColors.blue050,
    );
    final figure = Semantics(
      container: true,
      label: '$label, ${kesSemanticsLabel(amount)}',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: labelStyle),
          const SizedBox(height: 6),
          Text(
            formatKes(amount),
            style: NitumeTextStyles.amountLarge.copyWith(
              color: NitumeColors.white,
            ),
          ),
        ],
      ),
    );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: NitumeColors.blue,
        borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: figure),
              if (onInfo != null)
                IconButton(
                  onPressed: onInfo,
                  tooltip: 'About ${label.toLowerCase()}',
                  iconSize: 18,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints.tightFor(
                    width: NitumeSpacing.minTapTarget,
                    height: NitumeSpacing.minTapTarget,
                  ),
                  icon: const Icon(
                    Icons.info_outline_rounded,
                    color: NitumeColors.blue050,
                  ),
                ),
            ],
          ),
          for (final line in subLines.take(2))
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                line,
                style: NitumeTypography.numeric(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w400,
                  color: NitumeColors.blue050,
                ),
              ),
            ),
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(
                    child: NitumeButton.outline(
                      label: actions[i].label,
                      onPressed: actions[i].onPressed,
                      size: NitumeButtonSize.small,
                      expand: true,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
