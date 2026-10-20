import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';

/// R-24 (C-V7). The complete-state mark (`v-job-summary`
/// `.profile-avatar-lg` on green-050): a [size] circle in green-050 with a
/// 28px green-700 check (complete state; green-700 on green-050 is ~4.0:1,
/// plain green ~2.6:1 — R-24 amended by the v-active audit).
///
/// Read as [semanticLabel] (`Done`); pass `null` when a nearby heading
/// already says it, and the mark is skipped by screen readers. The screen
/// places it (mockup: centred, 12 below). Not shown for CANCELLED / FAILED.
///
/// The customer STK view draws the same circle at 64px; it can move to
/// `SuccessMark(size: 64, semanticLabel: null)`.
class SuccessMark extends StatelessWidget {
  const SuccessMark({super.key, this.size = 70, this.semanticLabel = 'Done'});

  /// Circle diameter; 70 in the runner mockup.
  final double size;

  /// Screen-reader label; `null` excludes the mark from semantics.
  final String? semanticLabel;

  /// Check size (mockup: 28).
  static const checkSize = 28.0;

  @override
  Widget build(BuildContext context) {
    final mark = Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: NitumeColors.green050,
      ),
      child: const Icon(
        Icons.check_rounded,
        size: checkSize,
        color: NitumeColors.green700,
      ),
    );
    final label = semanticLabel;
    if (label == null) return ExcludeSemantics(child: mark);
    return Semantics(
      label: label,
      image: true,
      child: ExcludeSemantics(child: mark),
    );
  }
}
