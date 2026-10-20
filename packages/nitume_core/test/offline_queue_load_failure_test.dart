import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// A store that fails the next [failReads] reads, can hold a read open with
/// [gate], and counts writes.
class _FlakyStore implements QueueStore {
  _FlakyStore(this.entries);

  List<String> entries;
  int failReads = 0;
  int writes = 0;
  Completer<void>? gate;

  @override
  Future<List<String>> read() async {
    final g = gate;
    if (g != null) await g.future;
    if (failReads > 0) {
      failReads--;
      throw const FileSystemException('unreadable');
    }
    return List.of(entries);
  }

  @override
  Future<void> write(List<String> entries) async {
    writes++;
    this.entries = List.of(entries);
  }
}

String _stored(String id) => jsonEncode(
  QueuedAction(
    id: id,
    kind: QueuedActionKind.runnerNotes,
    errandId: 'e1',
    payload: RunnerQueuedActions.runnerNotes(id),
    createdAt: DateTime.utc(2026, 10, 20),
  ).toJson(),
);

void main() {
  var n = 0;
  OfflineActionQueue make(QueueStore store) => OfflineActionQueue(
    store: store,
    runner: (_) async => ReplayOutcome.done,
    newId: () => 'new${n++}',
  );

  Future<QueuedAction> notes(OfflineActionQueue q) => q.enqueue(
    QueuedActionKind.runnerNotes,
    errandId: 'e1',
    payload: RunnerQueuedActions.runnerNotes('x'),
  );

  setUp(() => n = 0);

  group('a failed store read never loses the stored queue', () {
    test('load fails: closed, enqueue refused, nothing written', () async {
      final store = _FlakyStore([_stored('old1'), _stored('old2')])
        ..failReads = 1;
      final q = make(store);
      await expectLater(q.load(), throwsA(isA<FileSystemException>()));
      expect(q.isClosed, isTrue);
      await expectLater(notes(q), throwsStateError);
      expect(store.writes, 0);
      expect(store.entries, [_stored('old1'), _stored('old2')]);
    });

    test('a later load retry opens it with the stored actions', () async {
      final store = _FlakyStore([_stored('old1')])..failReads = 1;
      final q = make(store);
      await expectLater(q.load(), throwsA(isA<FileSystemException>()));
      await q.load();
      expect(q.isClosed, isFalse);
      expect(q.pending.map((a) => a.id), ['old1']);
      await notes(q);
      expect(q.pending.map((a) => a.id), ['old1', 'new0']);
      expect(store.entries, hasLength(2));
    });

    test('a failed reload of an open queue closes it', () async {
      final store = _FlakyStore([_stored('old1')]);
      final q = make(store);
      await q.load();
      store.failReads = 1;
      await expectLater(q.load(), throwsA(isA<FileSystemException>()));
      expect(q.isClosed, isTrue);
      await expectLater(notes(q), throwsStateError);
      expect(store.entries, [_stored('old1')]);
    });

    test('enqueue before any load reads the store first', () async {
      final store = _FlakyStore([_stored('old1')]);
      final q = make(store);
      await notes(q);
      expect(q.pending.map((a) => a.id), ['old1', 'new0']);
      expect(store.entries, hasLength(2));
    });

    test('enqueue before any load with an unreadable store is refused and '
        'writes nothing', () async {
      final store = _FlakyStore([_stored('old1')])..failReads = 1;
      final q = make(store);
      await expectLater(notes(q), throwsStateError);
      expect(q.isClosed, isTrue);
      expect(store.writes, 0);
      await q.load();
      expect(q.pending.map((a) => a.id), ['old1']);
    });

    test('enqueue during a load waits for it (open, not refused)', () async {
      final store = _FlakyStore([_stored('old1')]);
      final q = make(store);
      await q.clear(); // log out
      store.entries = [_stored('old1')];
      store.gate = Completer<void>();
      final loading = q.load();
      expect(q.isClosed, isFalse, reason: 'opening: enqueue waits');
      final queued = notes(q);
      store.gate!.complete();
      await loading;
      await queued;
      expect(q.pending.map((a) => a.id), ['old1', 'new0']);
    });

    test('enqueue during a load that fails is refused', () async {
      final store = _FlakyStore([_stored('old1')])
        ..failReads = 1
        ..gate = Completer<void>();
      final q = make(store);
      final loading = expectLater(
        q.load(),
        throwsA(isA<FileSystemException>()),
      );
      final queued = expectLater(notes(q), throwsStateError);
      store.gate!.complete();
      await loading;
      await queued;
      expect(store.writes, 0);
    });

    test('a clear during the read wins: stays closed', () async {
      final store = _FlakyStore([_stored('old1')])..gate = Completer<void>();
      final q = make(store);
      final loading = q.load();
      await q.clear();
      store.gate!.complete();
      await loading;
      expect(q.isClosed, isTrue);
      expect(q.pending, isEmpty);
    });

    test('overlapping loads share one read', () async {
      final store = _FlakyStore([_stored('old1')]);
      final q = make(store);
      final a = q.load();
      final b = q.load();
      expect(identical(a, b), isTrue);
      await a;
      expect(q.pending, hasLength(1));
    });
  });
}
