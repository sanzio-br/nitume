import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// R-05. Label / value detail row (`.verif-row`): label 13 Fira Sans on
/// the left, the value on the right, padding 12/0. Stack rows in an
/// [InfoRowList], which draws the slate-line hairline between rows and
/// none after the last.
///
/// * [InfoRow.new]: text value in Fira Sans 13 (addresses, `How it's paid`),
///   wraps.
/// * [InfoRow.numeric]: value in Fira Code 13 (distances, times, amounts).
///   Format it first (`formatKes`, `formatDistanceKm`, `formatDayTimeEat`).
/// * [InfoRow.trailing]: any trailing widget, e.g. a small `StatusChip`.
class InfoRow extends StatelessWidget {
  const InfoRow({
    super.key,
    required this.label,
    required String this.value,
    this.below,
  }) : numeric = false,
       trailing = null;

  const InfoRow.numeric({
    super.key,
    required this.label,
    required String this.value,
    this.below,
  }) : numeric = true,
       trailing = null;

  const InfoRow.trailing({
    super.key,
    required this.label,
    required Widget this.trailing,
    this.below,
  }) : numeric = false,
       value = null;

  final String label;
  final String? value;
  final bool numeric;
  final Widget? trailing;

  /// Optional widget under the label, e.g. a `NitumeButton.link`
  /// (`Upload again`) on a rejected verification row.
  final Widget? below;

  @override
  Widget build(BuildContext context) {
    final labelStyle = NitumeTextStyles.body.copyWith(fontSize: 13);
    final Widget right =
        trailing ??
        Text(
          value!,
          textAlign: TextAlign.end,
          style: numeric
              ? NitumeTypography.numeric(fontSize: 13)
              : labelStyle.copyWith(fontWeight: FontWeight.w500),
        );
    return Semantics(
      container: true,
      label: value == null ? label : '$label, $value',
      excludeSemantics: value != null && below == null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: below == null
              ? CrossAxisAlignment.center
              : CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: labelStyle),
                  ?below,
                ],
              ),
            ),
            const SizedBox(width: 12),
            Flexible(child: right),
          ],
        ),
      ),
    );
  }
}

/// A column of [InfoRow]s with a 1px slate-line hairline between rows and
/// none after the last. Place it inside a `NitumeCard`.
class InfoRowList extends StatelessWidget {
  const InfoRowList({super.key, required this.rows});

  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0)
            Divider(
              key: ValueKey('info-row-hairline-$i'),
              height: 1,
              thickness: 1,
              color: NitumeColors.slateLine,
            ),
          rows[i],
        ],
      ],
    );
  }
}
