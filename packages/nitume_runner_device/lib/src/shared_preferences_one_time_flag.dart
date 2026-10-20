import 'package:nitume_core/nitume_core.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// [OneTimeFlag] on `shared_preferences` (owner row 124): kept for the
/// install, not cleared at log out. Default [key] is the one-time job-start
/// location notice (`JobStartLocationNotice.showOnce`, row 246).
class SharedPreferencesOneTimeFlag implements OneTimeFlag {
  SharedPreferencesOneTimeFlag({
    SharedPreferencesAsync? prefs,
    this.key = 'nitume.jobStartLocationNotice.shown.v1',
  }) : _prefs = prefs ?? SharedPreferencesAsync();

  final SharedPreferencesAsync _prefs;
  final String key;

  @override
  Future<bool> isSet() async => await _prefs.getBool(key) ?? false;

  @override
  Future<void> set() => _prefs.setBool(key, true);
}
