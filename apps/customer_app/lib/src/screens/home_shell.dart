import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../state/auth_controller.dart';
import '../../widgets/nitume_card.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'tasks_screen.dart';

/// The authenticated bottom-nav shell.
///
/// Tab order follows `designs/nitume_customer_app.html`: Home, Tasks, Track,
/// Notifications, Profile. Track is wired to the live track screen once the
/// errand screens land; for now it hosts the category picker entry point.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _tabs = <_TabSpec>[
    _TabSpec('Home', Icons.home_outlined, Icons.home),
    _TabSpec('Tasks', Icons.assignment_outlined, Icons.assignment),
    _TabSpec('New task', Icons.add_circle_outline, Icons.add_circle),
    _TabSpec('Alerts', Icons.notifications_none, Icons.notifications),
    _TabSpec('Profile', Icons.person_outline, Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;

    return Scaffold(
      appBar: _index == 0
          ? AppBar(
              title: const Text('Nitume'),
              actions: [
                IconButton(
                  icon: const Icon(Icons.notifications_none),
                  onPressed: () => setState(() => _index = 3),
                ),
              ],
            )
          : null,
      body: SafeArea(child: _buildBody(user)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: [
          for (final tab in _tabs)
            NavigationDestination(
              icon: Icon(tab.icon),
              selectedIcon: Icon(tab.selectedIcon),
              label: tab.label,
            ),
        ],
      ),
    );
  }

  Widget _buildBody(AppUser? user) {
    return switch (_index) {
      0 => _HomeTab(user: user),
      1 => const TasksScreen(),
      2 => const _NewTaskPlaceholder(),
      3 => const NotificationsScreen(),
      _ => const ProfileScreen(),
    };
  }
}

class _TabSpec {
  const _TabSpec(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class _HomeTab extends StatelessWidget {
  const _HomeTab({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    final firstName = _greetName(user);
    return ListView(
      padding: const EdgeInsets.all(NitumeSpacing.md),
      children: [
        Text(
          _greeting(),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: NitumeColors.slate600,
              ),
        ),
        Text(firstName, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: NitumeSpacing.lg),
        Text('What do you need done?',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: NitumeSpacing.md),
        for (final category in ErrandCategory.values)
          Padding(
            padding: const EdgeInsets.only(bottom: NitumeSpacing.sm),
            child: NitumeCard(
              padding: const EdgeInsets.symmetric(
                horizontal: NitumeSpacing.md,
                vertical: NitumeSpacing.md,
              ),
              child: Row(
                children: [
                  const Icon(Icons.chevron_right,
                      color: NitumeColors.slate400),
                  const SizedBox(width: NitumeSpacing.sm),
                  Expanded(
                    child: Text(
                      category.label,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  String _greetName(AppUser? user) {
    final email = user?.email;
    if (email != null && email.isNotEmpty) return email.split('@').first;
    return 'there';
  }
}

class _NewTaskPlaceholder extends StatelessWidget {
  const _NewTaskPlaceholder();

  @override
  Widget build(BuildContext context) {
    return _ComingSoon(
      title: 'New task',
      message: 'The category wizard, review & pay, and M-Pesa payment screens '
          'land next.',
    );
  }
}

class _ComingSoon extends StatelessWidget {
  const _ComingSoon({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(NitumeSpacing.md),
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: NitumeSpacing.md),
        NitumeCard(
          child: Row(
            children: [
              const Icon(Icons.construction_outlined,
                  color: NitumeColors.slate400),
              const SizedBox(width: NitumeSpacing.md),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: NitumeColors.slate600,
                      ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}