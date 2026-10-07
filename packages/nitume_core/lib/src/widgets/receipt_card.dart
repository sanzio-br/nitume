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

/// C-18 caption under a total row: 12 slate-600, margin-top 8.
///
/// [text] is Fira Sans; [number] (optional) is appended in Fira Code, e.g.
/// `ReceiptCaption('Valid until ', number: '4:30 PM')`.
class ReceiptCaption extends StatelessWidget {
  const ReceiptCaption(this.text, {super.key, this.number});

  final String text;
  final String? number;

  @override
  Widget build(BuildContext context) {
    final style = NitumeTextStyles.body.copyWith(
      fontSize: 12,
      color: NitumeColors.slate600,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text.rich(
        TextSpan(
          text: text,
          children: [
            if (number != null)
              TextSpan(
                text: number,
                style: NitumeTypography.numeric(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: NitumeColors.slate600,
                ),
              ),
          ],
        ),
        style: style,
      ),
    );
  }
}

/// C-18 "paid separately" group (`_shared.md` §8): the item / merchant
/// amount, kept apart from the fee total. Slate-line hairline, 10 spacing,
/// its own [rows] (normally one `Item amount` / `Item budget` row) and an
/// optional 12 slate-600 [note] (`Paid to the merchant directly`).
///
/// Never add these amounts into the fee total above it.
class ReceiptSeparateGroup extends StatelessWidget {
  const ReceiptSeparateGroup({super.key, required this.rows, this.note});

  final List<ReceiptRow> rows;
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.only(top: 4),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: NitumeColors.slateLine)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ...rows,
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                note!,
                style: NitumeTextStyles.body.copyWith(
                  fontSize: 12,
                  color: NitumeColors.slate600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// C-18 (`.receipt-card`): white card, dashed slate-line border by default,
/// padding 16, containing the fee [rows], an optional [caption] under the
/// total (estimate note, validity time) and an optional [separate] group for
/// the item amount (`_shared.md` §8).
///
/// Inside a `NitumeFormCard` (wizard review, checkout) compose the same
/// pieces in a `Column` instead: rows, [ReceiptCaption],
/// [ReceiptSeparateGroup].
class ReceiptCard extends StatelessWidget {
  const ReceiptCard({
    super.key,
    required this.rows,
    this.dashed = true,
    this.caption,
    this.separate,
  });

  final List<ReceiptRow> rows;
  final bool dashed;
  final ReceiptCaption? caption;
  final ReceiptSeparateGroup? separate;

  @override
  Widget build(BuildContext context) {
    return NitumeCard(
      border: dashed ? NitumeCardBorder.dashed : NitumeCardBorder.solid,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [...rows, ?caption, ?separate],
      ),
    );
  }
}
