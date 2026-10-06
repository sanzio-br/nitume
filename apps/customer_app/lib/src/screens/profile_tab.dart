import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Profile tab: user profile, menu rows for addresses, payments, notifications, etc.
class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          backgroundColor: NitumeColors.slate,
          surfaceTintColor: NitumeColors.slate,
          title: const Text(
            'Profile',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              // Profile header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                child: Column(
                  children: [
                    Container(
                      width: 70,
                      height: 70,
                      decoration: BoxDecoration(
                        color: NitumeColors.blue,
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Text(
                          'A',
                          style: TextStyle(
                            color: NitumeColors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 24,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Achieng Otieno',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 18,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Customer since Feb 2026 · 42 tasks',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: NitumeColors.slate600,
                            fontFamily: 'FiraCode',
                            fontSize: 12,
                          ),
                    ),
                  ],
                ),
              ),
              // Menu rows
              _MenuRow(
                title: 'Saved addresses',
                onTap: () {
                  // TODO: Navigate to addresses
                },
              ),
              _MenuRow(
                title: 'Payment methods',
                onTap: () {
                  // TODO: Navigate to payment methods
                },
              ),
              _MenuRow(
                title: 'Notifications',
                onTap: () {
                  // TODO: Navigate to notifications
                },
              ),
              _MenuRow(
                title: 'Recurring tasks',
                onTap: () {
                  // TODO: Navigate to recurring tasks
                },
              ),
              _MenuRow(
                title: 'Support',
                onTap: () {
                  // TODO: Navigate to support
                },
              ),
              _MenuRow(
                title: 'Log out',
                isDestructive: true,
                onTap: () {
                  // TODO: Log out
                },
              ),
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }
}

class _MenuRow extends StatelessWidget {
  final String title;
  final bool isDestructive;
  final VoidCallback onTap;

  const _MenuRow({
    required this.title,
    this.isDestructive = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
          decoration: BoxDecoration(
            color: NitumeColors.white,
            border: Border.all(color: NitumeColors.slateLine),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                      fontSize: 13.5,
                      color: isDestructive ? NitumeColors.red : NitumeColors.blue,
                    ),
              ),
              const Spacer(),
              Icon(
                Icons.chevron_right,
                color: isDestructive ? NitumeColors.red : NitumeColors.slate400,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}