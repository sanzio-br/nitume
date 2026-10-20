import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

/// `v-notifications`: in-app feed. Opening the screen marks nothing read;
/// tapping a row or "Mark all read" does.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late final AppServices _services = context.services;
  List<AppNotification>? _items;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final page = await _services.notifications.list(limit: 50);
      if (mounted) setState(() => _items = page.items);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _markAll() async {
    try {
      await _services.notifications.markAllRead();
      await _load();
    } on Object catch (e) {
      if (mounted) showSnack(context, friendlyError(e));
    }
  }

  Future<void> _open(AppNotification n) async {
    if (!n.isRead) {
      _services.notifications.markRead(n.id).then((_) {
        if (mounted) _load();
      }, onError: (Object _) {});
    }
    await Nav.openNotification(
      context,
      eventType: n.eventType,
      errandId: n.errandId,
    );
  }

  static IconData _icon(NotificationEventType? e) => switch (e) {
    NotificationEventType.quoted => Icons.request_quote_outlined,
    NotificationEventType.runnerAssigned => Icons.person_pin_outlined,
    NotificationEventType.runnerEnRoute => Icons.place_outlined,
    NotificationEventType.arrived => Icons.flag_outlined,
    NotificationEventType.inProgress => Icons.directions_run_rounded,
    NotificationEventType.awaitingCustomer => Icons.fact_check_outlined,
    NotificationEventType.completed => Icons.check_circle_outline_rounded,
    NotificationEventType.disputed => Icons.report_outlined,
    NotificationEventType.cancelled => Icons.cancel_outlined,
    NotificationEventType.failed => Icons.error_outline_rounded,
    NotificationEventType.priceChangeRequested => Icons.sell_outlined,
    NotificationEventType.quoteReissued => Icons.request_quote_outlined,
    NotificationEventType.merchantDetailsAdded ||
    NotificationEventType.merchantDetailsChanged => Icons.storefront_outlined,
    NotificationEventType.quoteRequested => Icons.request_quote_outlined,
    NotificationEventType.refundApproved ||
    NotificationEventType.refundNoRefund ||
    NotificationEventType.refundRefunded => Icons.receipt_long_outlined,
    null => Icons.notifications_none_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final Widget body;
    if (_error != null && items == null) {
      body = NitumeErrorState(
        message: "Couldn't load notifications.",
        onRetry: _load,
      );
    } else if (items == null) {
      body = const SkeletonList(count: 4);
    } else if (items.isEmpty) {
      body = const NitumeEmptyState(message: "You're all caught up.");
    } else {
      body = RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: [
            for (final n in items)
              NotificationRow(
                // Rows 236, 241: not an enum value (core), checked first.
                icon: n.isOutsideServiceArea
                    ? Icons.wrong_location_outlined
                    : _icon(n.event),
                title: n.title,
                body: n.body,
                time: n.createdAt == null
                    ? ''
                    : formatRelativeShort(n.createdAt!),
                unread: !n.isRead,
                onTap: () => _open(n),
              ),
          ],
        ),
      );
    }
    final unread = items?.any((n) => !n.isRead) ?? false;
    return PushedScaffold(
      title: 'Notifications',
      trailing: unread
          ? NitumeButton.text(
              label: 'Mark all read',
              size: NitumeButtonSize.small,
              onPressed: _markAll,
            )
          : null,
      body: body,
    );
  }
}
