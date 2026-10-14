import 'package:nitume_core/nitume_core.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// [QueueStore] on `shared_preferences` (local queue store, owner row 124).
/// Holds small JSON entries only; evidence images stay as files.
class SharedPreferencesQueueStore implements QueueStore {
  SharedPreferencesQueueStore({
    SharedPreferencesAsync? prefs,
    this.key = 'nitume.offlineActionQueue.v1',
  }) : _prefs = prefs ?? SharedPreferencesAsync();

  final SharedPreferencesAsync _prefs;
  final String key;

  @override
  Future<List<String>> read() async =>
      await _prefs.getStringList(key) ?? const [];

  @override
  Future<void> write(List<String> entries) =>
      _prefs.setStringList(key, entries);
}
