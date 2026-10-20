import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// Records each request's `Idempotency-Key`; answers with extra response
/// headers when given.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes, {this.replayHeader = false});

  final Map<String, (int, Object?)> routes;
  final bool replayHeader;
  final calls = <String>[];
  final keys = <String?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    calls.add(key);
    keys.add(options.headers['Idempotency-Key'] as String?);
    final (status, body) = routes[key] ?? (404, {'message': 'Not found'});
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        'content-type': ['application/json'],
        if (replayHeader) 'idempotent-replay': ['true'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

RunnerJobsRepository _repo(_Adapter a) => RunnerJobsRepository(
  NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: InMemoryTokenStore(),
    httpClientAdapter: a,
  ),
);

Map<String, dynamic> _errand(String status) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'inspection',
  'description': 'Check',
  'status': status,
  'urgency': 'standard',
  'budget': '0.00',
};

final _transitionOk = (
  200,
  {
    'errand': _errand('ARRIVED'),
    'history': {
      'id': 'h1',
      'errandId': 'e1',
      'fromStatus': 'RUNNER_EN_ROUTE',
      'toStatus': 'ARRIVED',
      'actorType': 'runner',
      'createdAt': '2026-10-19T08:00:00.000Z',
    },
  },
);

QueuedAction _transition() => QueuedAction(
  id: 'act-1',
  kind: QueuedActionKind.statusTransition,
  errandId: 'e1',
  payload: RunnerQueuedActions.transition(
    from: ErrandStatus.runnerEnRoute,
    to: ErrandStatus.arrived,
  ),
  createdAt: DateTime.utc(2026, 10, 19),
);

QueuedAction _notes() => QueuedAction(
  id: 'act-2',
  kind: QueuedActionKind.runnerNotes,
  errandId: 'e1',
  payload: RunnerQueuedActions.runnerNotes('Gate was locked'),
  createdAt: DateTime.utc(2026, 10, 19),
);

QueuedAction _evidence() => QueuedAction(
  id: 'act-3',
  kind: QueuedActionKind.evidenceUpload,
  errandId: 'e1',
  payload: RunnerQueuedActions.evidence(
    path: '/tmp/x.jpg',
    type: EvidenceType.photo,
    contentType: 'image/jpeg',
  ),
  createdAt: DateTime.utc(2026, 10, 19),
);

(int, Object?) _coded(int status, String code) =>
    (status, {'statusCode': status, 'code': code, 'message': code});

void main() {
  QueuedActionRunner runner(_Adapter a) => RunnerQueuedActions.runnerFor(
    _repo(a),
    readFile: (_) async => Uint8List.fromList([1, 2, 3]),
  );

  test('every replayed kind sends the action id as Idempotency-Key', () async {
    final a = _Adapter({
      'PATCH /errands/e1/status': _transitionOk,
      'PATCH /errands/e1/runner-notes': (200, _errand('ARRIVED')),
      'POST /errands/e1/evidence': (
        201,
        {'id': 'ev1', 'errandId': 'e1', 'type': 'photo'},
      ),
    });
    final run = runner(a);
    expect(await run(_transition()), ReplayOutcome.done);
    expect(await run(_notes()), ReplayOutcome.done);
    expect(await run(_evidence()), ReplayOutcome.done);
    expect(a.keys, ['act-1', 'act-2', 'act-3']);
  });

  test('Idempotent-Replay: true (the first result again) is done', () async {
    final a = _Adapter({
      'POST /errands/e1/evidence': (
        201,
        {'id': 'ev1', 'errandId': 'e1', 'type': 'photo'},
      ),
    }, replayHeader: true);
    expect(await runner(a)(_evidence()), ReplayOutcome.done);
  });

  test('idempotency_in_progress retries later, for every kind', () async {
    final busy = _coded(409, ApiErrorCodes.idempotencyInProgress);
    final a = _Adapter({
      'PATCH /errands/e1/status': busy,
      'PATCH /errands/e1/runner-notes': busy,
      'POST /errands/e1/evidence': busy,
    });
    final run = runner(a);
    expect(await run(_transition()), ReplayOutcome.retryLater);
    expect(await run(_notes()), ReplayOutcome.retryLater);
    expect(await run(_evidence()), ReplayOutcome.retryLater);
    expect(a.calls, isNot(contains('GET /errands/e1')));
  });

  test('idempotency_key_reused on a transition: done when the job is '
      'already there, else rejected', () async {
    final reused = _coded(409, ApiErrorCodes.idempotencyKeyReused);
    final there = _Adapter({
      'PATCH /errands/e1/status': reused,
      'GET /errands/e1': (200, _errand('ARRIVED')),
    });
    expect(await runner(there)(_transition()), ReplayOutcome.done);
    final moved = _Adapter({
      'PATCH /errands/e1/status': reused,
      'GET /errands/e1': (200, _errand('CANCELLED')),
    });
    expect(await runner(moved)(_transition()), ReplayOutcome.rejected);
  });

  test('idempotency_key_reused / _invalid on notes and evidence are '
      'refusals', () async {
    final a = _Adapter({
      'PATCH /errands/e1/runner-notes': _coded(
        409,
        ApiErrorCodes.idempotencyKeyReused,
      ),
      'POST /errands/e1/evidence': _coded(
        400,
        ApiErrorCodes.idempotencyKeyInvalid,
      ),
    });
    final run = runner(a);
    expect(await run(_notes()), ReplayOutcome.rejected);
    expect(await run(_evidence()), ReplayOutcome.rejected);
  });

  test('evidence_too_large (413, row 252) on replay is permanent', () async {
    final a = _Adapter({
      'POST /errands/e1/evidence': (
        413,
        {
          'statusCode': 413,
          'code': 'evidence_too_large',
          'message': 'The file is larger than the limit',
          'maxBytes': 10485760,
        },
      ),
    });
    expect(await runner(a)(_evidence()), ReplayOutcome.tooLarge);
  });

  test('a bare 413 (no code) is too large only on an evidence replay; '
      'status and notes replays are plain refusals', () async {
    const bare = (413, {'statusCode': 413, 'message': 'Payload Too Large'});
    final a = _Adapter({
      'PATCH /errands/e1/status': bare,
      'PATCH /errands/e1/runner-notes': bare,
      'POST /errands/e1/evidence': bare,
    });
    final run = runner(a);
    expect(await run(_transition()), ReplayOutcome.rejected);
    expect(await run(_notes()), ReplayOutcome.rejected);
    expect(await run(_evidence()), ReplayOutcome.tooLarge);
  });

  test('replayOutcomeFor: idempotency_in_progress is temporary', () {
    expect(
      replayOutcomeFor(
        const NitumeApiException(
          message: 'x',
          statusCode: 409,
          code: ApiErrorCodes.idempotencyInProgress,
        ),
      ),
      ReplayOutcome.retryLater,
    );
    expect(ApiErrorCodes.idempotencyInProgress, 'idempotency_in_progress');
  });

  test('direct calls send no key unless given', () async {
    final a = _Adapter({
      'PATCH /errands/e1/status': _transitionOk,
      'PATCH /errands/e1/runner-notes': (200, _errand('ARRIVED')),
    });
    final repo = _repo(a);
    await repo.transition(
      'e1',
      from: ErrandStatus.runnerEnRoute,
      to: ErrandStatus.arrived,
    );
    await repo.updateRunnerNotes('e1', 'x');
    await repo.updateRunnerNotes('e1', 'x', idempotencyKey: 'k9');
    expect(a.keys, [null, null, 'k9']);
  });
}
