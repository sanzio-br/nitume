import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads the bundled Fira fonts under their package family names so widget
/// and golden tests render real glyphs instead of the Ahem test font.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  await _load('packages/nitume_core/FiraSans', const [
    'FiraSans-Regular',
    'FiraSans-Medium',
    'FiraSans-SemiBold',
    'FiraSans-Bold',
  ]);
  await _load('packages/nitume_core/FiraCode', const [
    'FiraCode-Regular',
    'FiraCode-Medium',
    'FiraCode-SemiBold',
    'FiraCode-Bold',
  ]);
  await testMain();
}

Future<void> _load(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes = File('fonts/$f.ttf').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}
