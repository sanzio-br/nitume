import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// New Task tab: entry point to the task creation wizard.
class NewTaskTab extends StatelessWidget {
  const NewTaskTab({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          backgroundColor: NitumeColors.slate,
          surfaceTintColor: NitumeColors.slate,
          title: Text(
            'New task',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'What do you need done?',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Choose a category to get started',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: NitumeColors.slate600,
                      ),
                ),
                const SizedBox(height: 24),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.85,
                  children: const [
                    _NewCategoryTile(
                      icon: '👀',
                      label: 'Inspect',
                      selected: true,
                    ),
                    _NewCategoryTile(
                      icon: '🛍️',
                      label: 'Buy',
                    ),
                    _NewCategoryTile(
                      icon: '📦',
                      label: 'Collect',
                    ),
                    _NewCategoryTile(
                      icon: '📍',
                      label: 'Visit',
                    ),
                    _NewCategoryTile(
                      icon: '📝',
                      label: 'Submit',
                    ),
                    _NewCategoryTile(
                      icon: '💼',
                      label: 'Business',
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () {
                      // TODO: Navigate to task details step
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: NitumeColors.green,
                      foregroundColor: NitumeColors.white,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                        fontFamily: 'FiraSans',
                      ),
                    ),
                    child: const Text('Continue →'),
                  ),
                ),
                const SizedBox(height: 100),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _NewCategoryTile extends StatelessWidget {
  final String icon;
  final String label;
  final bool selected;

  const _NewCategoryTile({
    required this.icon,
    required this.label,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        // TODO: Handle selection
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
        decoration: BoxDecoration(
          color: NitumeColors.white,
          border: Border.all(
            color: selected ? NitumeColors.green : NitumeColors.slateLine,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: NitumeColors.green050,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Center(
                child: Text(icon, style: const TextStyle(fontSize: 15)),
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
      ),
    );
  }
}