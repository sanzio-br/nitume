import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// R-02. Runner availability card (`.avail-row` + design-system active
/// toggle): blue card, card radius, padding 15/18.
///
/// * Leading 9px status dot with a 2px white ring: green when [online]
///   (an active state), slate-400 when offline. No glow ring (OA-14).
/// * Title `Online` / `Offline` 14/700 white.
/// * [areas] line in Fira Code 11 blue-050 (service areas joined by
///   ` · `, or the screen's empty copy).
/// * Trailing theme `Switch` (green active track, white thumb), announced
///   as `Available for jobs`, 48dp hit area.
///
/// [onChanged] `null` disables the switch; pass [disabledReason] (e.g.
/// `You can go online once your verification is approved.`) to show why,
/// in 11.5 blue-050 under the areas line.
class AvailabilityCard extends StatelessWidget {
  const AvailabilityCard({
    super.key,
    required this.online,
    required this.areas,
    required this.onChanged,
    this.disabledReason,
  });

  final bool online;
  final String areas;
  final ValueChanged<bool>? onChanged;
  final String? disabledReason;

  /// Switch semantics label (`_shared.md` §11).
  static const switchLabel = 'Available for jobs';

  @override
  Widget build(BuildContext context) {
    final title = online ? 'Online' : 'Offline';
    final reason = onChanged == null ? disabledReason : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
      decoration: BoxDecoration(
        color: NitumeColors.blue,
        borderRadius: BorderRadius.circular(NitumeDesignChoices.cardRadius),
      ),
      child: Row(
        children: [
          Container(
            key: const ValueKey('availability-dot'),
            width: 13,
            height: 13,
            decoration: BoxDecoration(
              color: online ? NitumeColors.green : NitumeColors.slate400,
              shape: BoxShape.circle,
              border: Border.all(color: NitumeColors.white, width: 2),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: NitumeTextStyles.body.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: NitumeColors.white,
                  ),
                ),
                Text(
                  areas,
                  style: NitumeTypography.numeric(
                    fontSize: 11,
                    fontWeight: FontWeight.w400,
                    color: NitumeColors.blue050,
                  ),
                ),
                if (reason != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    reason,
                    style: NitumeTextStyles.mutedSmall.copyWith(
                      color: NitumeColors.blue050,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Semantics(
            label: reason == null ? switchLabel : '$switchLabel. $reason',
            child: SizedBox(
              height: 48,
              child: Switch(
                value: online,
                onChanged: onChanged,
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
