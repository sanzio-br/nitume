import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';

/// C-11. 36px white circular bell (`.bell`) with a 7px unread dot, 48dp hit
/// area. Dot colour is [NitumeDesignChoices.unreadDot] (Q13).
class NotificationBell extends StatelessWidget {
  const NotificationBell({
    super.key,
    required this.unreadCount,
    required this.onPressed,
  });

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final hasUnread = unreadCount > 0;
    return Semantics(
      button: true,
      label: hasUnread
          ? 'Notifications, $unreadCount unread'
          : 'Notifications',
      excludeSemantics: true,
      child: InkResponse(
        onTap: onPressed,
        radius: 24,
        child: SizedBox.square(
          dimension: NitumeSpacing.minTapTarget,
          child: Center(
            child: SizedBox.square(
              dimension: 36,
              child: Stack(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: NitumeColors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: NitumeColors.slateLine),
                    ),
                    alignment: Alignment.center,
                    child: const Icon(
                      Icons.notifications_none_rounded,
                      size: 18,
                      color: NitumeColors.blue,
                    ),
                  ),
                  if (hasUnread)
                    Positioned(
                      top: 8,
                      right: 9,
                      child: Container(
                        key: const ValueKey('bell-unread-dot'),
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: NitumeDesignChoices.unreadDot,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: NitumeColors.white,
                            width: 1.5,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
