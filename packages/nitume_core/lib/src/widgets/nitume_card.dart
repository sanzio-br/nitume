import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';

/// Border style of a [NitumeCard].
enum NitumeCardBorder { solid, dashed }

/// C-07. White card on the slate canvas with a slate-line hairline
/// (design-system `.card-demo`). Radius from [NitumeDesignChoices.cardRadius].
class NitumeCard extends StatelessWidget {
  const NitumeCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.border = NitumeCardBorder.solid,
    this.semanticLabel,
    this.dashedBorderWidth = 1,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// [NitumeCardBorder.dashed] is the receipt variant (`.receipt-card`).
  final NitumeCardBorder border;

  /// Optional label when the card is tappable.
  final String? semanticLabel;

  /// Stroke width of the [NitumeCardBorder.dashed] border: 1 for receipts,
  /// 2 for the capture drop zone (`.upload-box`, R-13).
  final double dashedBorderWidth;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    Widget content = Padding(padding: padding, child: child);

    if (onTap != null) {
      content = InkWell(onTap: onTap, borderRadius: radius, child: content);
    }

    final decorated = border == NitumeCardBorder.solid
        ? DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(color: NitumeColors.slateLine),
            ),
            child: content,
          )
        : CustomPaint(
            foregroundPainter: _DashedBorderPainter(
              radius: NitumeDesignChoices.cardRadius,
              strokeWidth: dashedBorderWidth,
            ),
            child: content,
          );

    final card = Material(
      color: NitumeColors.white,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: decorated,
    );

    if (onTap == null) return card;
    return Semantics(button: true, label: semanticLabel, child: card);
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.radius, this.strokeWidth = 1});

  final double radius;
  final double strokeWidth;
  static const _dash = 4.0;
  static const _gap = 3.0;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = NitumeColors.slateLine
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    final rrect = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(strokeWidth / 2),
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + _dash), paint);
        distance += _dash + _gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.radius != radius || old.strokeWidth != strokeWidth;
}
