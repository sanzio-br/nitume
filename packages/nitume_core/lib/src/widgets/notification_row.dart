import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-28. Notification feed row (`.notif-row`): full-bleed white, bottom
/// hairline, 34px green-050 icon box, title 13/600, body 11.5 slate-600, Fira
/// Code 10.5 slate-400 time.
///
/// Unread styling is not drawn in the mockup (v-notifications Q2) and is not
/// implemented yet.
class NotificationRow extends StatelessWidget {
  const NotificationRow({
    super.key,
    required this.icon,
    required this.title,
    required this.time,
    this.body,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String? body;

  /// Relative time from `formatRelativeShort` (`2m`, `Yesterday`).
  final String time;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: [title, ?body, time].join(', '),
      excludeSemantics: true,
      child: Material(
        color: NitumeColors.white,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: NitumeColors.slateLine)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: NitumeColors.green050,
                    borderRadius: BorderRadius.circular(
                      NitumeDesignChoices.innerBoxRadius,
                    ),
                  ),
                  child: Icon(icon, size: 16, color: NitumeColors.green700),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: NitumeTextStyles.rowTitle.copyWith(fontSize: 13),
                      ),
                      if (body != null) ...[
                        const SizedBox(height: 2),
                        Text(body!, style: NitumeTextStyles.mutedSmall),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  time,
                  softWrap: false,
                  style: NitumeTypography.numeric(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w400,
                    color: NitumeColors.slate400,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
