import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_runner_device/nitume_runner_device.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

class _FakePathProvider extends PathProviderPlatform
    with MockPlatformInterfaceMixin {
  _FakePathProvider(this.support);

  final String support;

  @override
  Future<String?> getApplicationSupportPath() async => support;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  late List<MethodCall> calls;
  late Object? Function(MethodCall) reply;
  late Directory support;

  setUp(() {
    calls = [];
    reply = (_) => true;
    messenger.setMockMethodCallHandler(BackupExclusion.channel, (call) async {
      calls.add(call);
      final r = reply(call);
      if (r is PlatformException) throw r;
      return r;
    });
    support = Directory.systemTemp.createTempSync('app_support');
    PathProviderPlatform.instance = _FakePathProvider(support.path);
  });

  tearDown(() {
    messenger.setMockMethodCallHandler(BackupExclusion.channel, null);
    support.deleteSync(recursive: true);
    debugDefaultTargetPlatformOverride = null;
  });

  test('iOS: sets the key through the native side', () async {
    await BackupExclusion.exclude(
      Directory('/a/nitume_evidence'),
      platform: TargetPlatform.iOS,
    );
    expect(calls.single.method, 'excludeFromBackup');
    expect(calls.single.arguments, {'path': '/a/nitume_evidence'});

    reply = (_) => true;
    expect(
      await BackupExclusion.isExcluded(
        Directory('/a/nitume_evidence'),
        platform: TargetPlatform.iOS,
      ),
      isTrue,
    );
    expect(calls.last.method, 'isExcludedFromBackup');
  });

  test('iOS: a native failure is a FileSystemException', () async {
    reply = (_) => PlatformException(code: 'backup_exclusion_failed');
    await expectLater(
      BackupExclusion.exclude(Directory('/a'), platform: TargetPlatform.iOS),
      throwsA(isA<FileSystemException>()),
    );
    reply = (_) => false;
    await expectLater(
      BackupExclusion.exclude(Directory('/a'), platform: TargetPlatform.iOS),
      throwsA(isA<FileSystemException>()),
    );
  });

  test('Android: no native call (manifest backup rules)', () async {
    await BackupExclusion.exclude(
      Directory('/a'),
      platform: TargetPlatform.android,
    );
    expect(
      await BackupExclusion.isExcluded(
        Directory('/a'),
        platform: TargetPlatform.android,
      ),
      isNull,
    );
    expect(calls, isEmpty);
  });

  test('device store excludes the folder when it creates it (iOS)', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final store = appSupportEvidenceFileStore();
    final src = File('${support.path}/a.jpg')..writeAsStringSync('x');
    await store.keep(src.path);
    await store.keep(src.path);
    final folder = '${support.path}/nitume_evidence';
    expect(calls.map((c) => c.method), ['excludeFromBackup']);
    expect(calls.single.arguments, {'path': folder});

    // Re-created (e.g. cleared by the system): excluded again.
    Directory(folder).deleteSync(recursive: true);
    await store.keep(src.path);
    expect(calls, hasLength(2));
  });

  test('device store: exclusion failure never blocks a capture', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    reply = (_) => PlatformException(code: 'backup_exclusion_failed');
    final store = appSupportEvidenceFileStore();
    final src = File('${support.path}/a.jpg')..writeAsStringSync('x');
    final kept = await store.keep(src.path);
    expect(File(kept).existsSync(), isTrue);
    reply = (_) => true;
    await store.keep(src.path);
    expect(calls, hasLength(2), reason: 'retried on the next use');
  });
}
