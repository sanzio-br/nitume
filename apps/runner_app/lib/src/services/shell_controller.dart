import 'package:flutter/foundation.dart';

/// Root tab views (`_shared.md` §1), in tab-bar order.
enum RunnerTab { jobs, active, earnings, profile }

/// Which root tab is showing.
class ShellController extends ChangeNotifier {
  RunnerTab _tab = RunnerTab.jobs;

  RunnerTab get tab => _tab;

  void select(RunnerTab tab) {
    if (_tab == tab) return;
    _tab = tab;
    notifyListeners();
  }

  /// Switches to [tab] after a stack reset (sign-in lands on Jobs).
  void reset([RunnerTab tab = RunnerTab.jobs]) {
    _tab = tab;
    notifyListeners();
  }
}
