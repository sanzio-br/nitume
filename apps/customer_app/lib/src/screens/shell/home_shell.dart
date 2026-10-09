import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../checkout/price_change_dialog.dart';
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

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  static const _newTaskIndex = 1;

  /// States in which the API accepts a price-change request.
  /// Runners can request a price change only in IN_PROGRESS (row 49).
  static const _priceChangeable = {ErrandStatus.inProgress};

  bool _checkingPriceChange = false;
  StreamSubscription<PriceChangeRequested>? _priceSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // App-level `price_change:requested` (row 23): open the blocking modal
    // wherever the customer is.
    _priceSub = context.services.live.priceChangeRequests.listen(_onLivePrice);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _priceSub?.cancel();
    super.dispose();
  }

  Future<void> _onLivePrice(PriceChangeRequested event) async {
    if (_checkingPriceChange || !mounted) return;
    _checkingPriceChange = true;
    final services = context.services;
    try {
      final errand = await services.errands.get(event.errandId);
      if (errand.status != ErrandStatus.inProgress || !mounted) return;
      final pending = await services.priceChanges.pending(errand.id);
      if (pending != null && mounted) {
        await showPriceChangeDialog(context, errand: errand, request: pending);
      }
    } on Object {
      // Track and the resume check still show the request.
    } finally {
      _checkingPriceChange = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkPendingPriceChange();
  }

  /// On resume, open the blocking price-change modal for an IN_PROGRESS
  /// errand with a pending request (v-price-auth entry).
  Future<void> _checkPendingPriceChange() async {
    if (_checkingPriceChange) return;
    _checkingPriceChange = true;
    final services = context.services;
    try {
      final page = await services.errands.list(statuses: _priceChangeable);
      for (final e in page.items) {
        final pending = await services.priceChanges.pending(e.id);
        if (pending != null && mounted) {
          await showPriceChangeDialog(context, errand: e, request: pending);
          break;
        }
      }
    } on Object {
      // Best effort; Track also shows the request.
    } finally {
      _checkingPriceChange = false;
    }
  }

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
