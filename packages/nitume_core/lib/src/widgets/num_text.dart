import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';

/// C-32. Text for numeric data in Fira Code (design system `.t-num`).
///
/// Use for prices, times, dates, ETAs, counters (`3/5`) and ratings, and for
/// whole meta lines that mix words and numbers (`.li-meta`).
class NumText extends StatelessWidget {
  const NumText(
    this.data, {
    super.key,
    this.fontSize = 14,
    this.fontWeight = FontWeight.w500,
    this.color = NitumeColors.blue,
    this.textAlign,
    this.maxLines,
    this.overflow,
    this.semanticsLabel,
  });

  /// A Kenyan-shilling amount formatted by [formatKes] (`KSh 2,200`).
  /// [amount] is a [num] or an API decimal string.
  NumText.kes(
    Object amount, {
    super.key,
    bool signed = false,
    this.fontSize = 14,
    this.fontWeight = FontWeight.w600,
    this.color = NitumeColors.blue,
    this.textAlign,
    this.maxLines,
    this.overflow,
    this.semanticsLabel,
  }) : data = formatKes(amount, signed: signed);

  final String data;
  final double fontSize;
  final FontWeight fontWeight;
  final Color color;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    return Text(
      data,
      style: NitumeTypography.numeric(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      ),
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
      semanticsLabel: semanticsLabel,
    );
  }
}

/// C-32 inside mixed text: a [TextSpan] that renders [text] in Fira Code and
/// inherits size, weight and colour from its parent.
///
/// Use it to build the rich labels of [NitumeButton.richLabel] and
/// [NitumeNotice.richMessage], so a screen never picks Fira Code by hand:
///
/// ```dart
/// NitumeButton.primary(
///   label: 'Approve KSh 5,000 increase',
///   richLabel: TextSpan(children: [
///     const TextSpan(text: 'Approve '),
///     NumSpan.kes(5000),
///     const TextSpan(text: ' increase'),
///   ]),
///   onPressed: approve,
/// )
/// ```
class NumSpan extends TextSpan {
  const NumSpan(String text)
    : super(
        text: text,
        style: const TextStyle(
          fontFamily: NitumeTypography.numericFamily,
          letterSpacing: 0,
        ),
      );

  /// A Kenyan-shilling amount formatted by [formatKes] (`KSh 2,200`).
  NumSpan.kes(Object amount, {bool signed = false})
    : this(formatKes(amount, signed: signed));
}
