import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// Design-system list item (`.list-item`): 22px check, title 14.5/600 (done:
/// slate-600, struck through), Fira Code 12 meta, Fira Code 12.5/600 progress
/// counter (green-700 when complete). Stack inside a [NitumeListGroup].
class NitumeListItem extends StatelessWidget {
  const NitumeListItem({
    super.key,
    required this.title,
    this.meta,
    this.progress,
    this.done = false,
    this.onTap,
    this.onCheckedChanged,
  });

  final String title;
  final String? meta;

  /// Counter such as `3/5` (see `formatCounter`).
  final String? progress;
  final bool done;
  final VoidCallback? onTap;
  final ValueChanged<bool>? onCheckedChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        child: Row(
          children: [
            Semantics(
              checked: done,
              label: title,
              excludeSemantics: true,
              child: GestureDetector(
                onTap: onCheckedChanged == null
                    ? null
                    : () => onCheckedChanged!(!done),
                child: SizedBox.square(
                  dimension: 22,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: done ? NitumeColors.green : NitumeColors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: done ? NitumeColors.green : NitumeColors.slateLine,
                        width: 2,
                      ),
                    ),
                    child: done
                        ? const Icon(
                            Icons.check_rounded,
                            size: 12,
                            color: NitumeColors.white,
                          )
                        : null,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: NitumeTextStyles.rowTitle.copyWith(
                      fontSize: 14.5,
                      color: done ? NitumeColors.slate600 : NitumeColors.blue,
                      decoration: done ? TextDecoration.lineThrough : null,
                      decorationColor: NitumeColors.slateLine,
                    ),
                  ),
                  if (meta != null) ...[
                    const SizedBox(height: 2),
                    Text(meta!, style: NitumeTextStyles.metaLarge),
                  ],
                ],
              ),
            ),
            if (progress != null) ...[
              const SizedBox(width: 14),
              Text(
                progress!,
                style: NitumeTypography.numeric(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: done ? NitumeColors.green700 : NitumeColors.slate600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Design-system `.list-demo`: white, slate-line border, r-m 14, hairlines
/// between children.
class NitumeListGroup extends StatelessWidget {
  const NitumeListGroup({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeRadii.medium);
    return DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(color: NitumeColors.slateLine),
      ),
      child: Material(
        color: NitumeColors.white,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const Divider(),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}
