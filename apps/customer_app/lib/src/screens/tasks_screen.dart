import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import '../state/providers.dart';
import '../widgets/nitume_card.dart';

/// `GET /errands` — the customer's tasks, newest first.
final myErrandsProvider = FutureProvider.autoDispose<List<Errand>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.getList('/errands');
  return data
      .whereType<Map<String, dynamic>>()
      .map(Errand.fromJson)
      .toList(growable: false);
});

class TasksScreen extends ConsumerWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final errands = ref.watch(myErrandsProvider);

    return errands.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => _ErrorState(error: error, onRetry: () {
        ref.invalidate(myErrandsProvider);
      }),
      data: (items) {
        if (items.isEmpty) {
          return _EmptyState(
            message: 'No tasks yet. Tap “New task” to get your first errand '
                'under way.',
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(NitumeSpacing.md),
          itemCount: items.length,
          itemBuilder: (context, index) => Padding(
            padding: const EdgeInsets.only(bottom: NitumeSpacing.sm),
            child: ErrandCard(errand: items[index]),
          ),
        );
      },
    );
  }
}

/// Reusable task card — the list-item pattern from the design system.
class ErrandCard extends StatelessWidget {
  const ErrandCard({super.key, required this.errand, this.onTap});

  final Errand errand;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final presentation = statusPresentation(errand.status);
    final price = errand.displayPrice;

    return NitumeCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  errand.category.label,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              StatusChip(
                label: presentation.label,
                tone: presentation.tone,
              ),
            ],
          ),
          const SizedBox(height: NitumeSpacing.sm),
          Text(
            errand.description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: NitumeColors.slate600,
                ),
          ),
          const SizedBox(height: NitumeSpacing.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '#${errand.id.substring(0, 8)}',
                style: NitumeTypography.numeric(
                  fontSize: 12,
                  color: NitumeColors.slate400,
                ),
              ),
              if (price != null)
                Text(
                  'KES ${_format(price)}',
                  style: NitumeTypography.numeric(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  static String _format(String decimal) {
    final parts = decimal.split('.');
    final whole = parts.first;
    final grouped = whole.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+$)'),
      (match) => '${match.group(1)},',
    );
    return parts.length > 1 ? '$grouped.${parts[1]}' : grouped;
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(NitumeSpacing.lg),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: NitumeColors.slate600,
              ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final message = error is NitumeApiException
        ? error.message
        : 'Something went wrong. Please try again.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(NitumeSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: NitumeColors.slate600,
                  ),
            ),
            const SizedBox(height: NitumeSpacing.md),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}