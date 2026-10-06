import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Home tab: greeting, search, categories, active task, recent tasks.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          backgroundColor: NitumeColors.slate,
          surfaceTintColor: NitumeColors.slate,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Good afternoon',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: NitumeColors.slate600,
                    ),
              ),
              Text(
                'Achieng',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
          actions: [
            IconButton(
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: NitumeColors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: NitumeColors.slateLine),
                    ),
                    child: Icon(
                      Icons.notifications_none,
                      color: NitumeColors.blue,
                      size: 20,
                    ),
                  ),
                  Positioned(
                    right: 4,
                    top: 4,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: NitumeColors.red,
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
              onPressed: () {
                // TODO: Navigate to notifications
              },
            ),
            const SizedBox(width: 8),
            const CircleAvatar(
              radius: 18,
              backgroundColor: NitumeColors.blue,
              child: Text(
                'A',
                style: TextStyle(
                  color: NitumeColors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 12),
          ],
        ),
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Search row
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  decoration: BoxDecoration(
                    color: NitumeColors.white,
                    border: Border.all(color: NitumeColors.slateLine),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.search,
                        color: NitumeColors.slate400,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'What do you need done?',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: NitumeColors.slate400,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
              // Categories
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Text(
                  'Categories',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        letterSpacing: 0.05,
                        color: NitumeColors.slate600,
                      ),
              ),
              ),
              SizedBox(
                height: 110,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: const [
                    _CategoryTile(icon: '🛍️', label: 'Buy'),
                    SizedBox(width: 10),
                    _CategoryTile(icon: '📦', label: 'Collect'),
                    SizedBox(width: 10),
                    _CategoryTile(icon: '👀', label: 'Inspect'),
                    SizedBox(width: 10),
                    _CategoryTile(icon: '📍', label: 'Visit'),
                    SizedBox(width: 10),
                    _CategoryTile(icon: '📝', label: 'Submit'),
                    SizedBox(width: 10),
                    _CategoryTile(icon: '💼', label: 'Business'),
                  ],
                ),
              ),
              // In progress
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
                child: Text(
                  'In progress',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        letterSpacing: 0.05,
                        color: NitumeColors.slate600,
                      ),
              ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _ActiveTaskCard(
                  onTrack: () {
                    // TODO: Navigate to track tab
                  },
                ),
              ),
              // Recent
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
                child: Text(
                  'Recent',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        letterSpacing: 0.05,
                        color: NitumeColors.slate600,
                      ),
              ),
              ),
              const _HistoryRow(
                title: 'Buy shoes — Sarit Centre',
                subtitle: 'Yesterday, 4:12 PM',
                status: 'Completed',
                statusColor: NitumeColors.green,
              ),
              const _HistoryRow(
                title: 'Collect documents — CBD',
                subtitle: 'Mon, 10:03 AM',
                status: 'Completed',
                statusColor: NitumeColors.green,
              ),
              const SizedBox(height: 100), // Bottom padding for nav bar
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  final String icon;
  final String label;

  const _CategoryTile({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 80,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: NitumeColors.green050,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(icon, style: const TextStyle(fontSize: 18)),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  fontSize: 11.5,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ActiveTaskCard extends StatelessWidget {
  final VoidCallback onTrack;

  const _ActiveTaskCard({required this.onTrack});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: NitumeColors.blue,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: NitumeColors.green.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              'Inspection · #10482',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: NitumeColors.green,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Apartment check — Nyali',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: NitumeColors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 15.5,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            'Brian K. is en route · ETA 12 min',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: NitumeColors.slate400,
                  fontFamily: 'FiraCode',
                  fontSize: 12,
                ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onTrack,
              style: FilledButton.styleFrom(
                backgroundColor: NitumeColors.green,
                foregroundColor: NitumeColors.white,
                padding: const EdgeInsets.symmetric(vertical: 9),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                textStyle: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                  fontFamily: 'FiraSans',
                ),
              ),
              child: const Text('Track live →'),
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final String status;
  final Color statusColor;

  const _HistoryRow({
    required this.title,
    required this.subtitle,
    required this.status,
    required this.statusColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
      child: InkWell(
        onTap: () {
          // TODO: Navigate to task detail
        },
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: NitumeColors.slate600,
                            fontFamily: 'FiraCode',
                            fontSize: 11,
                          ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  status,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w700,
                        fontSize: 10.5,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}