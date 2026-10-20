import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  late Directory base;
  late Directory outside;
  late DirectoryEvidenceFileStore store;

  setUp(() {
    base = Directory.systemTemp.createTempSync('support');
    outside = Directory.systemTemp.createTempSync('cache');
    store = DirectoryEvidenceFileStore(() async => base);
  });

  tearDown(() {
    base.deleteSync(recursive: true);
    outside.deleteSync(recursive: true);
  });

  Future<String> keepOne(String name) async {
    final src = File('${outside.path}/$name')..writeAsStringSync('x');
    return store.keep(src.path);
  }

  test('keptPaths lists only the store folder', () async {
    expect(await store.keptPaths(), isEmpty);
    final a = await keepOne('a.jpg');
    final b = await keepOne('b.jpg');
    File('${base.path}/other.txt').writeAsStringSync('not ours');
    expect(await store.keptPaths(), unorderedEquals([a, b]));
  });

  test('discardAll deletes every kept copy, nothing outside', () async {
    await keepOne('a.jpg');
    await keepOne('b.jpg');
    final other = File('${base.path}/other.txt')..writeAsStringSync('x');
    await store.discardAll();
    expect(await store.keptPaths(), isEmpty);
    expect(other.existsSync(), isTrue);
    expect(outside.listSync(), hasLength(2), reason: 'sources untouched');
  });

  test('discardExcept keeps what the queue holds', () async {
    final queued = await keepOne('a.jpg');
    await keepOne('b.jpg');
    await store.discardExcept([queued]);
    expect(await store.keptPaths(), [queued]);
  });

  test('evidencePaths reads the queued evidence uploads', () {
    QueuedAction action(
      String id,
      QueuedActionKind kind,
      Map<String, Object?> p,
    ) => QueuedAction(
      id: id,
      kind: kind,
      errandId: 'e1',
      payload: p,
      createdAt: DateTime.utc(2026, 10, 20),
    );
    final paths = RunnerQueuedActions.evidencePaths([
      action(
        'a',
        QueuedActionKind.evidenceUpload,
        RunnerQueuedActions.evidence(
          path: '/s/1.jpg',
          type: EvidenceType.photo,
          contentType: 'image/jpeg',
        ),
      ),
      action(
        'b',
        QueuedActionKind.runnerNotes,
        RunnerQueuedActions.runnerNotes('x'),
      ),
    ]);
    expect(paths, {'/s/1.jpg'});
  });

  group('discard only deletes direct children of the store folder', () {
    String root() => '${base.path}/nitume_evidence';

    test(
      'a valid kept path is deleted, also when written with . or ..',
      () async {
        final a = await keepOne('a.jpg');
        final b = await keepOne('b.jpg');
        await store.discard(a);
        expect(File(a).existsSync(), isFalse);
        final name = b.split('/').last;
        await store.discard('${root()}/./../nitume_evidence/$name');
        expect(File(b).existsSync(), isFalse);
      },
    );

    test('.. that leaves the folder is ignored', () async {
      await keepOne('a.jpg');
      final victim = File('${base.path}/victim.txt')..writeAsStringSync('x');
      await store.discard('${root()}/../victim.txt');
      expect(victim.existsSync(), isTrue);
      final outsideVictim = File('${outside.path}/v.txt')
        ..writeAsStringSync('x');
      final rel = '${root()}/../../${outside.path.split('/').last}/v.txt';
      await store.discard(rel);
      expect(outsideVictim.existsSync(), isTrue);
    });

    test('a sibling folder sharing the name prefix is ignored', () async {
      await keepOne('a.jpg');
      final sibling = Directory('${root()}2')..createSync();
      final victim = File('${sibling.path}/x.jpg')..writeAsStringSync('x');
      await store.discard(victim.path);
      expect(victim.existsSync(), isTrue);
    });

    test('a sub-folder or a symlinked folder inside is ignored', () async {
      await keepOne('a.jpg');
      final sub = Directory('${root()}/sub')..createSync();
      final nested = File('${sub.path}/x.jpg')..writeAsStringSync('x');
      await store.discard(nested.path);
      expect(nested.existsSync(), isTrue);

      final target = File('${outside.path}/secret.jpg')..writeAsStringSync('x');
      Link('${root()}/link').createSync(outside.path);
      await store.discard('${root()}/link/secret.jpg');
      expect(target.existsSync(), isTrue);
    });

    test('the folder itself, empty and relative paths are ignored', () async {
      await keepOne('a.jpg');
      await store.discard(root());
      await store.discard('');
      await store.discard('nitume_evidence/a.jpg');
      expect(Directory(root()).existsSync(), isTrue);
      expect(await store.keptPaths(), hasLength(1));
    });

    test('discardAll / discardExcept never reach outside', () async {
      final kept = await keepOne('a.jpg');
      final victim = File('${base.path}/victim.txt')..writeAsStringSync('x');
      final sibling = Directory('${root()}2')..createSync();
      final sib = File('${sibling.path}/x.jpg')..writeAsStringSync('x');
      await store.discardExcept(['${root()}/../victim.txt']);
      expect(File(kept).existsSync(), isFalse);
      expect(victim.existsSync(), isTrue);
      expect(sib.existsSync(), isTrue);
      await store.discardAll();
      expect(victim.existsSync(), isTrue);
    });
  });
}
