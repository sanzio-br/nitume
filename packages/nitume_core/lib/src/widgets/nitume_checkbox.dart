import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// C-36. Design-system `.check`: 22px box, radius 6, 2px slate-line border;
/// checked = green fill and border with a white 12px check. 48dp hit area.
///
/// With [label] it becomes a checkbox row (`Set as default`, `Use as my
/// default`): box + 13.5 blue label, the whole row tappable.
///
/// [onChanged] `null` disables it (no tap; the look does not change, e.g.
/// the current default address shown checked).
class NitumeCheckbox extends StatelessWidget {
  const NitumeCheckbox({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.semanticLabel,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;

  /// Optional label to the right (13.5 blue).
  final String? label;

  /// Announced label when there is no visible [label].
  final String? semanticLabel;

  /// Box size (`.check`).
  static const double size = 22;

  @override
  Widget build(BuildContext context) {
    final box = SizedBox.square(
      dimension: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: value ? NitumeColors.green : NitumeColors.white,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: value ? NitumeColors.green : NitumeColors.slateLine,
            width: 2,
          ),
        ),
        child: value
            ? const Icon(
                Icons.check_rounded,
                size: 12,
                color: NitumeColors.white,
              )
            : null,
      ),
    );

    final content = label == null
        ? SizedBox.square(
            dimension: NitumeSpacing.minTapTarget,
            child: Center(child: box),
          )
        : ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: NitumeSpacing.minTapTarget,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                box,
                const SizedBox(width: 10),
                Flexible(child: Text(label!, style: NitumeTextStyles.body)),
              ],
            ),
          );

    return Semantics(
      checked: value,
      enabled: onChanged != null,
      label: label ?? semanticLabel,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onChanged == null ? null : () => onChanged!(!value),
        child: content,
      ),
    );
  }
}
