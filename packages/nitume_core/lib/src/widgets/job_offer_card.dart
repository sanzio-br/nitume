import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_button.dart';
import 'nitume_card.dart';
import 'nitume_tag.dart';
import 'num_text.dart';

/// R-04. Job offer card (`.offer-card`) on the runner's Jobs tab.
///
/// White card (C-07), padding 16: [category] as a [NitumeTag] on the left
/// and the runner's pay ([payAmount], Fira Code 17/600) on the right; the
/// [title] 14/600; the [meta] line in Fira Code 11.5 slate-600 (parts
/// joined with ` · `, e.g. `1.2 km away · Photos required`); an optional
/// [notice] (usually a `NitumeNotice` for the purchase-limit warning,
/// row 108); then `Decline` (C-03 small) and `Accept` (C-01 small), equal
/// width, gap 8.
///
/// [richMeta] (opt-in, reviewer minor 1 on `feat/runner-batch-1`) draws the
/// meta line in Fira Sans 11.5 slate-600 with only its [NumSpan] parts in
/// Fira Code (`1.2 km` · `Photos required`); [meta] stays the spoken text
/// and is required with it. Note: runner `_shared.md` §3 currently says
/// `.offer-meta` is Fira Code as a whole line, which the plain [meta] does.
///
/// Card tap ([onTap]) opens the offer detail. [onAccept] / [onDecline]
/// `null` disables that button; [accepting] shows a spinner on Accept and
/// disables both.
class JobOfferCard extends StatelessWidget {
  const JobOfferCard({
    super.key,
    required this.category,
    required this.payAmount,
    required this.title,
    this.meta,
    this.notice,
    required this.onAccept,
    required this.onDecline,
    this.onTap,
    this.accepting = false,
    this.richMeta,
  }) : assert(
         richMeta == null || meta != null,
         'richMeta needs meta as its accessible text',
       );

  /// Category display name (`ErrandCategory.label`), never a wire value.
  final String category;

  /// Runner fee as a [num] or API decimal string (`formatKes`).
  final Object payAmount;
  final String title;
  final String? meta;

  /// Rich version of [meta] (same wording), numbers as [NumSpan]s.
  final InlineSpan? richMeta;
  final Widget? notice;
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final VoidCallback? onTap;
  final bool accepting;

  @override
  Widget build(BuildContext context) {
    final semantic = [
      category,
      title,
      kesSemanticsLabel(payAmount),
      ?meta,
    ].join(', ');
    return NitumeCard(
      onTap: onTap,
      semanticLabel: semantic,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          MergeSemantics(
            child: Semantics(
              label: semantic,
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Flexible(child: NitumeTag(category)),
                      const SizedBox(width: 10),
                      const Spacer(),
                      Text(
                        formatKes(payAmount),
                        style: NitumeTypography.numeric(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    title,
                    style: NitumeTextStyles.rowTitle.copyWith(fontSize: 14),
                  ),
                  if (richMeta != null) ...[
                    const SizedBox(height: 4),
                    Text.rich(
                      richMeta!,
                      style: NitumeTextStyles.mutedSmall.copyWith(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: NitumeColors.slate600,
                      ),
                    ),
                  ] else if (meta != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      meta!,
                      style: NitumeTypography.numeric(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: NitumeColors.slate600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (notice != null) ...[const SizedBox(height: 10), notice!],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: NitumeButton.outline(
                  label: 'Decline',
                  size: NitumeButtonSize.small,
                  onPressed: accepting ? null : onDecline,
                  expand: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: NitumeButton.primary(
                  label: 'Accept',
                  size: NitumeButtonSize.small,
                  onPressed: onAccept,
                  loading: accepting,
                  expand: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
