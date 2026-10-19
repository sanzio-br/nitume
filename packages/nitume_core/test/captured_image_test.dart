import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  test('CapturedImage.discard deletes the file and its scratch dir', () async {
    final root = await Directory.systemTemp.createTemp('nitume_capture');
    addTearDown(() => root.delete(recursive: true));
    final scratch = Directory('${root.path}/scratch')..createSync();
    final file = File('${scratch.path}/id.jpg')..writeAsBytesSync([1, 2]);
    final img = CapturedImage(path: file.path, scratchDirectory: scratch.path);
    await img.discard();
    expect(file.existsSync(), isFalse);
    expect(scratch.existsSync(), isFalse);
    await img.discard();
  });

  test(
    'CapturedImage.discard without a scratch dir deletes the file',
    () async {
      final root = await Directory.systemTemp.createTemp('nitume_capture');
      addTearDown(() => root.delete(recursive: true));
      final file = File('${root.path}/cap.jpg')..writeAsBytesSync([1]);
      await CapturedImage(path: file.path).discard();
      expect(file.existsSync(), isFalse);
      expect(root.existsSync(), isTrue);
    },
  );
}
