import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_card.dart';

/// C-18 row (`.receipt-row`): label left (Fira Sans 13), amount right
/// (Fira Code 13). [isTotal] adds the top hairline and 700 weight.
class ReceiptRow extends StatelessWidget {
  /// [amount] is a [num] or API decimal string, formatted as `KSh 2,200`;
  /// `null` renders an em dash.
  const ReceiptRow({
    super.key,
    required this.label,
    required this.amount,
    this.isTotal = false,
  });

  final String label;
  final Object? amount;
  final bool isTotal;

  @override
  Widget build(BuildContext context) {
    final weight = isTotal ? FontWeight.w700 : FontWeight.w400;
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: Text(
            label,
            style: NitumeTextStyles.body.copyWith(
              fontSize: 13,
              fontWeight: weight,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          formatKesOrDash(amount),
          style: NitumeTypography.numeric(fontSize: 13, fontWeight: weight),
        ),
      ],
    );
    if (!isTotal) {
      return Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: row);
    }
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.only(top: 10, bottom: 6),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: NitumeColors.slateLine)),
      ),
      child: row,
    );
  }
}

/// C-18 (`.receipt-card`): white card, dashed slate-line border by default,
/// padding 16, containing [ReceiptRow]s.
class ReceiptCard extends StatelessWidget {
  const ReceiptCard({super.key, required this.rows, this.dashed = true});

  final List<ReceiptRow> rows;
  final bool dashed;

  @override
  Widget build(BuildContext context) {
    return NitumeCard(
      border: dashed ? NitumeCardBorder.dashed : NitumeCardBorder.solid,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: rows,
      ),
    );
  }
}
