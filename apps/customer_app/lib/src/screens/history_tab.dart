import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// History tab: list of completed/cancelled tasks.
class HistoryTab extends StatelessWidget {
  const HistoryTab({super.key});

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
            'History',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              _HistoryCard(
                title: 'Apartment check — Nyali',
                subtitle: 'Today, 10:03 AM · Brian K.',
                amount: 'KSh 2,200',
                status: 'Completed',
                statusColor: NitumeColors.green,
                onTap: () {
                  // TODO: Navigate to task detail
                },
              ),
              _HistoryCard(
                title: 'Buy shoes — Sarit Centre',
                subtitle: 'Yesterday, 4:12 PM · Faith M.',
                amount: 'KSh 1,000',
                status: 'Completed',
                statusColor: NitumeColors.green,
                onTap: () {
                  // TODO: Navigate to task detail
                },
              ),
              _HistoryCard(
                title: 'Collect documents — CBD',
                subtitle: 'Mon, 10:03 AM · Peter O.',
                amount: 'KSh 500',
                status: 'Completed',
                statusColor: NitumeColors.green,
                onTap: () {
                  // TODO: Navigate to task detail
                },
              ),
              _HistoryCard(
                title: 'NTSA queue',
                subtitle: 'Last week · —',
                amount: '—',
                status: 'Cancelled',
                statusColor: NitumeColors.red,
                onTap: () {
                  // TODO: Navigate to task detail
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

class _HistoryCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String amount;
  final String status;
  final Color statusColor;
  final VoidCallback onTap;

  const _HistoryCard({
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.status,
    required this.statusColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
          decoration: BoxDecoration(
            color: NitumeColors.white,
            border: Border.all(color: NitumeColors.slateLine),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                          ),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
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
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      subtitle,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: NitumeColors.slate600,
                            fontFamily: 'FiraCode',
                            fontSize: 11,
                          ),
                    ),
                  ),
                  Text(
                    amount,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontFamily: 'FiraCode',
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}