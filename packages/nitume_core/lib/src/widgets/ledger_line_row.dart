import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';

/// R-12. Payout-ledger line (`.payout-row`) on the runner's Earnings and
/// payout history: white, card radius, 1px slate-line, padding 12/15.
///
/// * Left: [title] 12.5 Fira Sans (task title, `Payout to M-Pesa`), then a
///   caption line: [caption] in 11 slate-600 Fira Sans (the line kind:
///   `Runner fee`, `Item reimbursement`, `Correction`, …) followed by an
///   optional [captionNumeric] in Fira Code (`Mon, 10:03 AM`), and an
///   optional [status] (a `StatusChip` with `StatusChipSize.compact`:
///   `Pending`, `On hold`, `Paid`).
/// * Right: the signed [amount] in Fira Code 13/600 **blue**
///   (`+ KSh 1,750`, `− KSh 6,000`, via `formatKesLedger`). Never green or
///   red text for money.
///
/// Each line is its own row; nothing is merged or netted (row 107).
class LedgerLineRow extends StatelessWidget {
  const LedgerLineRow({
    super.key,
    required this.title,
    required this.caption,
    this.captionNumeric,
    this.status,
    required this.amount,
    this.onTap,
  });

  final String title;
  final String caption;
  final String? captionNumeric;
  final Widget? status;

  /// Signed amount: [num] or API decimal string (`"-6000.00"`).
  final Object amount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    final captionStyle = NitumeTextStyles.mutedSmall.copyWith(fontSize: 11);
    final semantic = [
      title,
      caption,
      ?captionNumeric,
      kesSemanticsLabel(amount),
    ].join(', ');
    return Material(
      color: NitumeColors.white,
      borderRadius: radius,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: NitumeColors.slateLine),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Semantics(
                        label: semantic,
                        excludeSemantics: true,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: NitumeTextStyles.body.copyWith(
                                fontSize: 12.5,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text.rich(
                              TextSpan(
                                text: caption,
                                children: [
                                  if (captionNumeric != null)
                                    TextSpan(
                                      text: ' $captionNumeric',
                                      style: NitumeTypography.numeric(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w400,
                                        color: NitumeColors.slate600,
                                      ),
                                    ),
                                ],
                              ),
                              style: captionStyle,
                            ),
                          ],
                        ),
                      ),
                      if (status != null) ...[
                        const SizedBox(height: 6),
                        status!,
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                ExcludeSemantics(
                  child: Text(
                    formatKesLedger(amount),
                    style: NitumeTypography.numeric(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
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
