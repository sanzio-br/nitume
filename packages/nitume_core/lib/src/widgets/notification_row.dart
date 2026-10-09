import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-28. Notification feed row (`.notif-row`): full-bleed white, bottom
/// hairline, 34px green-050 icon box, title 13/600, body 11.5 slate-600, Fira
/// Code 10.5 slate-400 time.
///
/// [unread] (OA-13): title 700 and a 7px red dot
/// ([NitumeDesignChoices.unreadDot]) under the time, right-aligned,
/// margin-top 6; announced as "Unread.".
class NotificationRow extends StatelessWidget {
  const NotificationRow({
    super.key,
    required this.icon,
    required this.title,
    required this.time,
    this.body,
    this.onTap,
    this.unread = false,
  });

  final IconData icon;
  final String title;
  final String? body;

  /// Relative time from `formatRelativeShort` (`2m`, `Yesterday`).
  final String time;
  final VoidCallback? onTap;
  final bool unread;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: [if (unread) 'Unread', title, ?body, time].join(', '),
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
                        style: NitumeTextStyles.rowTitle.copyWith(
                          fontSize: 13,
                          fontWeight:
                              unread ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                      if (body != null) ...[
                        const SizedBox(height: 2),
                        Text(body!, style: NitumeTextStyles.mutedSmall),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      time,
                      softWrap: false,
                      style: NitumeTypography.numeric(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w400,
                        color: NitumeColors.slate400,
                      ),
                    ),
                    if (unread)
                      Container(
                        key: const ValueKey('notification-unread-dot'),
                        margin: const EdgeInsets.only(top: 6),
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: NitumeDesignChoices.unreadDot,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
