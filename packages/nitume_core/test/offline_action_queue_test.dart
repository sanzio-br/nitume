import 'dart:convert';
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
        onRejected: rejected.add,
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
}
