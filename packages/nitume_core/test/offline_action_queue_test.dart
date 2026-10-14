import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

const _net = NitumeApiException(message: 'offline', isNetworkError: true);
const _conflict = NitumeApiException(message: 'moved', statusCode: 409);

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    calls.add(key);
    final (status, body) = routes[key] ?? (404, {'message': 'Not found'});
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: const {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _errand(String status) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'inspection',
  'description': 'Check',
  'status': status,
  'urgency': 'standard',
  'budget': '0.00',
};

void main() {
  group('OfflineActionQueue (R-21)', () {
    test('persists, reloads and replays in order', () async {
      final store = InMemoryQueueStore();
      var n = 0;
      final ran = <String>[];
      final q = OfflineActionQueue(
        store: store,
        runner: (a) async {
          ran.add(a.id);
          return ReplayOutcome.done;
        },
        newId: () => 'k${n++}',
      );
      await q.enqueue(
        QueuedActionKind.statusTransition,
        errandId: 'e1',
        payload: RunnerQueuedActions.transition(
          from: ErrandStatus.runnerEnRoute,
          to: ErrandStatus.arrived,
        ),
      );
      await q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: RunnerQueuedActions.runnerNotes('Gate locked'),
      );
      expect(store.entries, hasLength(2));

      // A fresh queue (app restart) reads the same actions.
      final restored = OfflineActionQueue(
        store: store,
        runner: (a) async {
          ran.add(a.id);
          return ReplayOutcome.done;
        },
      );
      await restored.load();
      expect(restored.pending.map((a) => a.id), ['k0', 'k1']);
      expect(restored.pending.first.payload['to'], 'ARRIVED');
      await restored.replay();
      expect(ran, ['k0', 'k1']);
      expect(restored.isEmpty, isTrue);
      expect(store.entries, isEmpty);
    });

    test('stops at a network failure and keeps order', () async {
      final store = InMemoryQueueStore();
      var n = 0;
      var offline = true;
      final ran = <String>[];
      final q = OfflineActionQueue(
        store: store,
        newId: () => 'k${n++}',
        runner: (a) async {
          ran.add(a.id);
          if (offline) throw _net;
          return ReplayOutcome.done;
        },
      );
      for (var i = 0; i < 2; i++) {
        await q.enqueue(
          QueuedActionKind.runnerNotes,
          errandId: 'e1',
          payload: const {'runnerNotes': 'x'},
        );
      }
      await q.replay();
      expect(ran, ['k0']);
      expect(q.pending.first.attempts, 1);
      offline = false;
      await q.replay();
      expect(ran, ['k0', 'k0', 'k1']);
      expect(q.isEmpty, isTrue);
    });

    test('a rejected action is dropped and reported', () async {
      final rejected = <QueuedAction>[];
      final q = OfflineActionQueue(
        store: InMemoryQueueStore(),
        onDropped: (a, reason) {
          expect(reason, QueueDropReason.refused);
          rejected.add(a);
        },
        runner: (a) async => throw _conflict,
      );
      await q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: const {'runnerNotes': 'x'},
      );
      await q.replay();
      expect(q.isEmpty, isTrue);
      expect(rejected.single.errandId, 'e1');
    });

    test('unreadable stored entries are dropped on load', () async {
      final store = InMemoryQueueStore()..entries = ['not json', '{"id":1}'];
      final q = OfflineActionQueue(
        store: store,
        runner: (_) async => ReplayOutcome.done,
      );
      await q.load();
      expect(q.isEmpty, isTrue);
    });
  });

  group('RunnerQueuedActions.runnerFor', () {
    RunnerJobsRepository repo(_Adapter a) => RunnerJobsRepository(
      NitumeApiClient(
        config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
        tokenStore: InMemoryTokenStore(),
        httpClientAdapter: a,
      ),
    );

    QueuedAction transition() => QueuedAction(
      id: 'k1',
      kind: QueuedActionKind.statusTransition,
      errandId: 'e1',
      payload: RunnerQueuedActions.transition(
        from: ErrandStatus.runnerEnRoute,
        to: ErrandStatus.arrived,
      ),
      createdAt: DateTime.utc(2026, 10, 13),
    );

    test('409 counts as done when the job is already there', () async {
      final a = _Adapter({
        'PATCH /errands/e1/status': (409, {'message': 'Invalid transition'}),
        'GET /errands/e1': (200, _errand('ARRIVED')),
      });
      expect(
        await RunnerQueuedActions.runnerFor(repo(a))(transition()),
        ReplayOutcome.done,
      );
    });

    test('409 with another state is rejected', () async {
      final a = _Adapter({
        'PATCH /errands/e1/status': (409, {'message': 'Invalid transition'}),
        'GET /errands/e1': (200, _errand('CANCELLED')),
      });
      expect(
        await RunnerQueuedActions.runnerFor(repo(a))(transition()),
        ReplayOutcome.rejected,
      );
    });

    test('evidence replays from the local file', () async {
      final a = _Adapter({
        'POST /errands/e1/evidence': (
          201,
          {'id': 'ev1', 'errandId': 'e1', 'type': 'photo'},
        ),
      });
      final runner = RunnerQueuedActions.runnerFor(
        repo(a),
        readFile: (p) async => Uint8List.fromList([1, 2, 3]),
      );
      final outcome = await runner(
        QueuedAction(
          id: 'k2',
          kind: QueuedActionKind.evidenceUpload,
          errandId: 'e1',
          payload: RunnerQueuedActions.evidence(
            path: '/tmp/x.jpg',
            type: EvidenceType.photo,
            contentType: 'image/jpeg',
          ),
          createdAt: DateTime.utc(2026, 10, 13),
        ),
      );
      expect(outcome, ReplayOutcome.done);
      expect(a.calls, ['POST /errands/e1/evidence']);
    });
  });

  group('replayOutcomeFor (B1)', () {
    NitumeApiException status(int s) =>
        NitumeApiException(message: 'x', statusCode: s);

    test('temporary failures retry later', () {
      for (final e in <Object>[
        _net,
        status(500),
        status(502),
        status(503),
        status(408),
        status(429),
        status(401),
        const NitumeApiException(message: 'no status'),
        TimeoutException('slow'),
        const SocketException('down'),
      ]) {
        expect(replayOutcomeFor(e), ReplayOutcome.retryLater, reason: '$e');
      }
    });

    test('real refusals drop; a missing file is its own outcome', () {
      for (final s in [400, 403, 404, 409, 422]) {
        expect(replayOutcomeFor(status(s)), ReplayOutcome.rejected);
      }
      expect(
        replayOutcomeFor(const PathNotFoundException('/x', OSError())),
        ReplayOutcome.fileMissing,
      );
    });

    test('a 503 during replay keeps the action', () async {
      final q = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async => throw status(503),
      );
      await q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: const {'runnerNotes': 'x'},
      );
      await q.replay();
      expect(q.pending.single.attempts, 1);
    });
  });

  group('queue integrity (item 9)', () {
    test('clear() during a replay does not re-add the action', () async {
      final gate = Completer<ReplayOutcome>();
      final settled = <String>[];
      final store = InMemoryQueueStore();
      final q = OfflineActionQueue(
        store: store,
        runner: (_) => gate.future,
        onSettled: (a) async => settled.add(a.id),
        newId: () => 'k1',
      );
      await q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: const {'runnerNotes': 'x'},
      );
      final replay = q.replay();
      await q.clear();
      gate.complete(ReplayOutcome.retryLater);
      await replay;
      expect(q.isEmpty, isTrue);
      expect(store.entries, isEmpty);
      expect(settled, ['k1']);
    });

    test('writes are serialised in call order', () async {
      final store = _SlowStore();
      var n = 0;
      final q = OfflineActionQueue(
        store: store,
        runner: (_) async => ReplayOutcome.done,
        newId: () => 'k${n++}',
      );
      await Future.wait([
        for (var i = 0; i < 3; i++)
          q.enqueue(
            QueuedActionKind.runnerNotes,
            errandId: 'e1',
            payload: const {'runnerNotes': 'x'},
          ),
      ]);
      expect(store.writes.map((w) => w.length), [1, 2, 3]);
      expect(store.maxConcurrent, 1);
    });

    test('a refused status change drops later status changes for the '
        'same errand only', () async {
      var n = 0;
      final dropped = <(String, QueueDropReason)>[];
      final ran = <String>[];
      final q = OfflineActionQueue(
        store: InMemoryQueueStore(),
        newId: () => 'k${n++}',
        onDropped: (a, r) => dropped.add((a.id, r)),
        runner: (a) async {
          ran.add(a.id);
          return a.id == 'k0' ? ReplayOutcome.rejected : ReplayOutcome.done;
        },
      );
      Future<void> transition(
        String errand,
        ErrandStatus from,
        ErrandStatus to,
      ) => q.enqueue(
        QueuedActionKind.statusTransition,
        errandId: errand,
        payload: RunnerQueuedActions.transition(from: from, to: to),
      );
      await transition('e1', ErrandStatus.runnerEnRoute, ErrandStatus.arrived);
      await q.enqueue(
        QueuedActionKind.runnerNotes,
        errandId: 'e1',
        payload: const {'runnerNotes': 'x'},
      );
      await transition('e1', ErrandStatus.arrived, ErrandStatus.inProgress);
      await transition('e2', ErrandStatus.arrived, ErrandStatus.inProgress);
      await q.replay();
      expect(dropped, [
        ('k0', QueueDropReason.refused),
        ('k2', QueueDropReason.superseded),
      ]);
      expect(ran, ['k0', 'k1', 'k3']);
      expect(q.isEmpty, isTrue);
    });

    test(
      'a missing photo is reported, and settled actions are cleaned up',
      () async {
        final dropped = <QueueDropReason>[];
        final settled = <String>[];
        final q = OfflineActionQueue(
          store: InMemoryQueueStore(),
          newId: () => 'k1',
          onDropped: (_, r) => dropped.add(r),
          onSettled: (a) async => settled.add(a.id),
          runner: (_) async => ReplayOutcome.fileMissing,
        );
        await q.enqueue(
          QueuedActionKind.evidenceUpload,
          errandId: 'e1',
          payload: RunnerQueuedActions.evidence(
            path: '/gone.jpg',
            type: EvidenceType.photo,
            contentType: 'image/jpeg',
          ),
        );
        await q.replay();
        expect(dropped, [QueueDropReason.fileMissing]);
        expect(settled, ['k1']);
      },
    );
  });

  group('EvidenceFileStore', () {
    late Directory tmp;
    setUp(() => tmp = Directory.systemTemp.createTempSync('nitume_ev'));
    tearDown(() => tmp.deleteSync(recursive: true));

    test('keeps a copy, cleans it up, never deletes outside', () async {
      final src = File('${tmp.path}/cache.jpg')..writeAsBytesSync([1, 2]);
      final files = DirectoryEvidenceFileStore(() async => tmp);
      final kept = await files.keep(src.path);
      expect(kept, isNot(src.path));
      expect(File(kept).readAsBytesSync(), [1, 2]);
      src.deleteSync();
      expect(File(kept).existsSync(), isTrue);

      final cleanup = RunnerQueuedActions.cleanupFor(files);
      await cleanup(
        QueuedAction(
          id: 'k',
          kind: QueuedActionKind.evidenceUpload,
          errandId: 'e1',
          payload: {'path': kept},
          createdAt: DateTime.utc(2026),
        ),
      );
      expect(File(kept).existsSync(), isFalse);

      final outside = File('${tmp.path}/other.jpg')..writeAsBytesSync([1]);
      await files.discard(outside.path);
      expect(outside.existsSync(), isTrue);
    });

    test('keep throws when the source is gone', () async {
      final files = DirectoryEvidenceFileStore(() async => tmp);
      expect(
        files.keep('${tmp.path}/missing.jpg'),
        throwsA(isA<FileSystemException>()),
      );
    });
  });

  test('replay runner reports a missing file', () async {
    final runner = RunnerQueuedActions.runnerFor(
      RunnerJobsRepository(
        NitumeApiClient(
          config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
          tokenStore: InMemoryTokenStore(),
          httpClientAdapter: _Adapter({}),
        ),
      ),
      readFile: (p) => throw PathNotFoundException(p, const OSError()),
    );
    final outcome = await runner(
      QueuedAction(
        id: 'k',
        kind: QueuedActionKind.evidenceUpload,
        errandId: 'e1',
        payload: RunnerQueuedActions.evidence(
          path: '/gone.jpg',
          type: EvidenceType.photo,
          contentType: 'image/jpeg',
        ),
        createdAt: DateTime.utc(2026),
      ),
    );
    expect(outcome, ReplayOutcome.fileMissing);
  });
}

class _SlowStore implements QueueStore {
  final writes = <List<String>>[];
  int _active = 0;
  int maxConcurrent = 0;

  @override
  Future<List<String>> read() async => const [];

  @override
  Future<void> write(List<String> entries) async {
    _active++;
    if (_active > maxConcurrent) maxConcurrent = _active;
    // Earlier writes take longer: without serialisation they would finish
    // out of order.
    await Future<void>.delayed(Duration(milliseconds: 30 - writes.length * 10));
    writes.add(entries);
    _active--;
  }
}
