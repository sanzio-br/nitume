import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../account/profile_tab.dart';
import '../active/active_tab.dart';
import '../earnings/earnings_tab.dart';
import '../jobs/jobs_tab.dart';

/// Signed-in shell: four root views above the 4-item tab bar (C-13,
/// `_shared.md` §1). Pushed screens cover the tab bar.
class RunnerShell extends StatelessWidget {
  const RunnerShell({super.key});

  /// Mockup icons briefcase, eye, circle-plus, person as Material outline
  /// equivalents.
  static const items = [
    NitumeTabItem(
      icon: Icons.work_outline_rounded,
      activeIcon: Icons.work_rounded,
      label: 'Jobs',
    ),
    NitumeTabItem(
      icon: Icons.visibility_outlined,
      activeIcon: Icons.visibility_rounded,
      label: 'Active',
    ),
    NitumeTabItem(
      icon: Icons.add_circle_outline_rounded,
      activeIcon: Icons.add_circle_rounded,
      label: 'Earnings',
    ),
    NitumeTabItem(
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      label: 'Profile',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final shell = AppScope.of(context).shell;
    return ListenableBuilder(
      listenable: shell,
      builder: (context, _) {
        final index = shell.tab.index;
        return Scaffold(
          backgroundColor: NitumeColors.slate,
          body: IndexedStack(
            index: index,
            children: const [
              JobsTab(),
              ActiveTab(),
              EarningsTab(),
              ProfileTab(),
            ],
          ),
          bottomNavigationBar: NitumeTabBar(
            items: items,
            currentIndex: index,
            onTap: (i) => shell.select(RunnerTab.values[i]),
          ),
        );
      },
    );
  }
}
