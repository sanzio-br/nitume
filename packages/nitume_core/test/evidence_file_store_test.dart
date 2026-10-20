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
}
