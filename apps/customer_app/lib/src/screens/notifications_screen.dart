import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import '../state/providers.dart';
import '../widgets/nitume_card.dart';

/// `GET /notifications` — the customer's notification feed.
final notificationsProvider =
    FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.getList('/notifications');
  return data
      .whereType<Map<String, dynamic>>()
      .map(AppNotification.fromJson)
      .toList(growable: false);
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);

    return notifications.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(
        child: OutlinedButton(
          onPressed: () => ref.invalidate(notificationsProvider),
          child: const Text('Try again'),
        ),
      ),
      data: (items) {
        if (items.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(NitumeSpacing.lg),
              child: Text(
                'Nothing here yet. Task updates will show up in this feed.',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(NitumeSpacing.md),
          itemCount: items.length,
          itemBuilder: (context, index) => Padding(
            padding: const EdgeInsets.only(bottom: NitumeSpacing.sm),
            child: NitumeCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(top: 6, right: NitumeSpacing.sm),
                    decoration: BoxDecoration(
                      color: items[index].isRead
                          ? NitumeColors.slateLine
                          : NitumeColors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          items[index].title,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: NitumeSpacing.xs),
                        Text(
                          items[index].body,
                          style:
                              Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    color: NitumeColors.slate600,
                                  ),
                        ),
                        const SizedBox(height: NitumeSpacing.sm),
                        Text(
                          formatRelative(items[index].createdAt),
                          style: NitumeTypography.numeric(
                            fontSize: 12,
                            color: NitumeColors.slate400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Renders a coarse relative timestamp, e.g. `2h ago`.
String formatRelative(DateTime? createdAt) {
  if (createdAt == null) return '';
  final diff = DateTime.now().toUtc().difference(createdAt.toUtc());
  if (diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return createdAt.toIso8601String().substring(0, 10);
}