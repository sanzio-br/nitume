import 'package:flutter/foundation.dart';

/// Root tab views (`_shared.md` §1). "New task" is a tab-bar item that
/// pushes the wizard; it is not a root view.
enum ShellTab { home, track, history, profile }

/// Which root tab is showing, and which errand Track should show.
class ShellController extends ChangeNotifier {
  ShellTab _tab = ShellTab.home;
  String? _trackErrandId;

  ShellTab get tab => _tab;

  /// Errand Track should select, if one was requested.
  String? get trackErrandId => _trackErrandId;

  void select(ShellTab tab) {
    if (_tab == tab) return;
    _tab = tab;
    notifyListeners();
  }

  bool _openPriceChange = false;

  /// Switches to Track on [errandId] (OA-21, after payment; Home card).
  /// [openPriceChange] asks Track to open the price-change modal when a
  /// request is still pending (notification / push deep link).
  void showTrack(String? errandId, {bool openPriceChange = false}) {
    _tab = ShellTab.track;
    _trackErrandId = errandId;
    _openPriceChange = openPriceChange;
    notifyListeners();
  }

  /// Returns the price-change request flag once.
  bool takeOpenPriceChange() {
    final v = _openPriceChange;
    _openPriceChange = false;
    return v;
  }

  /// Returns the requested Track errand once and forgets it, so a later
  /// manual selection on Track is not overridden.
  String? takeTrackErrandId() {
    final id = _trackErrandId;
    _trackErrandId = null;
    return id;
  }

  /// Switches to [tab] after a stack reset (root tabs reload when the pushed
  /// screens above them close).
  void reset(ShellTab tab) {
    _tab = tab;
    notifyListeners();
  }
}
