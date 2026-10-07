import 'package:flutter/foundation.dart';

/// Root tab views (`_shared.md` §1). "New task" is a tab-bar item that
/// pushes the wizard; it is not a root view.
enum ShellTab { home, track, history, profile }

/// Which root tab is showing, and which errand Track should show.
class ShellController extends ChangeNotifier {
  ShellTab _tab = ShellTab.home;
  String? _trackErrandId;
  int _refreshTick = 0;

  ShellTab get tab => _tab;

  /// Errand Track should select, if one was requested.
  String? get trackErrandId => _trackErrandId;

  /// Bumped when root tabs should reload (after a stack reset).
  int get refreshTick => _refreshTick;

  void select(ShellTab tab) {
    if (_tab == tab) return;
    _tab = tab;
    notifyListeners();
  }

  /// Switches to Track on [errandId] (OA-21, after payment; Home card).
  void showTrack(String? errandId) {
    _tab = ShellTab.track;
    _trackErrandId = errandId;
    _refreshTick++;
    notifyListeners();
  }

  /// Switches to [tab] and asks the root tabs to reload.
  void reset(ShellTab tab) {
    _tab = tab;
    _refreshTick++;
    notifyListeners();
  }
}
