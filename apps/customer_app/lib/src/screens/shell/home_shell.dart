import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import 'history_tab.dart';
import 'home_tab.dart';
import 'profile_tab.dart';
import 'track_tab.dart';

/// Signed-in shell: four root views above the 5-item tab bar (C-13). The
/// "New task" item pushes the wizard over the shell instead of showing a
/// root view (`_shared.md` §1).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  static const items = [
    NitumeTabItem(
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: 'Home',
    ),
    NitumeTabItem(icon: Icons.add_circle_outline_rounded, label: 'New task'),
    NitumeTabItem(
      icon: Icons.location_on_outlined,
      activeIcon: Icons.location_on_rounded,
      label: 'Track',
    ),
    NitumeTabItem(
      icon: Icons.history_rounded,
      activeIcon: Icons.history_rounded,
      label: 'History',
    ),
    NitumeTabItem(
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      label: 'Profile',
    ),
  ];

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  static const _newTaskIndex = 1;

  static int _indexOf(ShellTab tab) => switch (tab) {
    ShellTab.home => 0,
    ShellTab.track => 2,
    ShellTab.history => 3,
    ShellTab.profile => 4,
  };

  void _onTap(BuildContext context, int index) {
    final shell = context.services.shell;
    switch (index) {
      case 0:
        shell.select(ShellTab.home);
      case _newTaskIndex:
        Nav.toNewTask(context);
      case 2:
        shell.select(ShellTab.track);
      case 3:
        shell.select(ShellTab.history);
      case 4:
        shell.select(ShellTab.profile);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shell = AppScope.of(context).shell;
    return ListenableBuilder(
      listenable: shell,
      builder: (context, _) {
        final tab = shell.tab;
        return Scaffold(
          backgroundColor: NitumeColors.slate,
          body: IndexedStack(
            index: ShellTab.values.indexOf(tab),
            children: [
              HomeTab(active: tab == ShellTab.home),
              TrackTab(active: tab == ShellTab.track),
              HistoryTab(active: tab == ShellTab.history),
              ProfileTab(active: tab == ShellTab.profile),
            ],
          ),
          bottomNavigationBar: NitumeTabBar(
            items: HomeShell.items,
            currentIndex: _indexOf(tab),
            onTap: (i) => _onTap(context, i),
          ),
        );
      },
    );
  }
}
