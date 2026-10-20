import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';

/// R-06. Navigation bar over the job map (`.nav-chip`): white, card radius,
/// 1px slate-line border (no shadow, OA-14), padding 10/14.
///
/// [destination] 13/700 Fira Sans (the next point's `addressText`) with an
/// optional [detail] line in Fira Code 11 slate-600 (`1.2 km · 6 min`,
/// build it with `formatDistanceKm` / `formatDurationMin`; omit it when
/// unknown). Trailing C-01 small `Navigate`, which the screen wires to the
/// external Google Maps launch (`_shared.md` §10).
///
/// [richDetail] (opt-in) draws the detail line in Fira Sans 11 slate-600
/// with only its [NumSpan] parts in Fira Code, for text that is not all
/// numbers (`Distance unavailable`, or `1.2 km` · `Pickup`); [detail] stays
/// the spoken text and is required with it. Without it, [detail] is drawn
/// in Fira Code as before.
///
/// Place it with `JobRouteMap(overlay:)`, which insets it 12 from the map's
/// bottom, left and right edges.
class NavigationChip extends StatelessWidget {
  const NavigationChip({
    super.key,
    required this.destination,
    this.detail,
    this.richDetail,
    required this.onNavigate,
  }) : assert(
         richDetail == null || detail != null,
         'richDetail needs detail as its accessible text',
       );

  final String destination;
  final String? detail;

  /// Rich version of [detail] (same wording), numbers as [NumSpan]s.
  final InlineSpan? richDetail;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: NitumeColors.white,
        borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
        border: Border.all(color: NitumeColors.slateLine),
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              container: true,
              label: detail == null ? destination : '$destination, $detail',
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    destination,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: NitumeTextStyles.body.copyWith(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (richDetail != null)
                    Text.rich(
                      richDetail!,
                      style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 11),
                    )
                  else if (detail != null)
                    Text(detail!, style: NitumeTextStyles.meta),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          NitumeButton.primary(
            label: 'Navigate',
            size: NitumeButtonSize.small,
            onPressed: onNavigate,
          ),
        ],
      ),
    );
  }
}
