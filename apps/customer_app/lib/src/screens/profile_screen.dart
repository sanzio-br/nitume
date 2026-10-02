import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import '../state/auth_controller.dart';
import '../state/providers.dart';
import '../widgets/nitume_card.dart';

/// `GET /customers/me` — the signed-in customer's profile.
final customerProfileProvider =
    FutureProvider.autoDispose<CustomerProfile>((ref) async {
  final api = ref.watch(apiClientProvider);
  return CustomerProfile.fromJson(await api.getMap('/customers/me'));
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).value;
    final profile = ref.watch(customerProfileProvider);

    return ListView(
      padding: const EdgeInsets.all(NitumeSpacing.md),
      children: [
        Text('Profile', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: NitumeSpacing.md),
        NitumeCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user?.phone ?? '—',
                style: NitumeTypography.numeric(fontSize: 16),
              ),
              if (user?.email != null) ...[
                const SizedBox(height: NitumeSpacing.xs),
                Text(
                  user!.email!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: NitumeColors.slate600,
                      ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: NitumeSpacing.md),
        _Row(
          title: 'Saved addresses',
          subtitle: profile.valueOrNull?.defaultAddressText,
          onTap: () => _notReady('Saved addresses'),
        ),
        const SizedBox(height: NitumeSpacing.sm),
        _Row(
          title: 'Payment methods',
          subtitle: 'M-Pesa and card details',
          onTap: () => _notReady('Payment methods'),
        ),
        const SizedBox(height: NitumeSpacing.lg),
        OutlinedButton.icon(
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

/// The address and payment-method screens are queued for the next unit of work.
void _notReady(String screen) {
  debugPrint('TODO(nitume): navigate to $screen');
}

class _Row extends StatelessWidget {
  const _Row({
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return NitumeCard(
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: NitumeSpacing.xs),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: NitumeColors.slate600,
                        ),
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: NitumeColors.slate400),
        ],
      ),
    );
  }
}