import 'package:flutter/foundation.dart';

/// Root tab views (`_shared.md` §1), in tab-bar order.
enum RunnerTab { jobs, active, earnings, profile }

/// Which root tab is showing.
class ShellController extends ChangeNotifier {
  RunnerTab _tab = RunnerTab.jobs;

  RunnerTab get tab => _tab;
  String? _focusedJob;

  /// The job `v-active` should show (accept, push tap, `Other jobs`);
  /// `null` for the selection rule.
  String? get focusedJob => _focusedJob;

  /// Selects the Active tab on [errandId].
  void showJob(String errandId) {
    _focusedJob = errandId;
    _tab = RunnerTab.active;
    notifyListeners();
  }

  /// The runner left the shown job (`Back to jobs`).
  void clearFocus() {
    if (_focusedJob == null) return;
    _focusedJob = null;
    notifyListeners();
  }

  void select(RunnerTab tab) {
    if (_tab == tab) return;
    _tab = tab;
    notifyListeners();
  }

  /// Switches to [tab] after a stack reset (sign-in lands on Jobs).
  void reset([RunnerTab tab = RunnerTab.jobs]) {
    _tab = tab;
    _focusedJob = null;
    notifyListeners();
  }
}
