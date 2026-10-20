import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> _job(
  String id,
  String status, {
  String assignment = 'accepted',
}) => {
  'id': id,
  'reference': 'NT-$id',
  'status': status,
  'category': 'buy_for_me',
  'title': null,
  'description': 'Buy milk',
  'urgency': 'standard',
  'deadlineAt': '2026-10-19T12:00:00.000Z',
  'runnerFee': '250.00',
  'itemAmount': null,
  'merchantRoute': null,
  'requiredPurchase': '0.00',
  'maxPurchaseAdvance': '3000.00',
  'overPurchaseLimit': false,
  'assignment': {'id': 'a-$id', 'status': assignment},
};

(int, Object?) _page(List<Map<String, dynamic>> items, [String? next]) =>
    (200, {'items': items, 'nextCursor': next});

const _revoked = (
  403,
  {
    'statusCode': 403,
    'code': 'job_not_held',
    'message': 'This job is not assigned to you',
  },
);

const _revokedOld = (
  403,
  {'statusCode': 403, 'message': 'You do not have access to this errand'},
);

void main() {
  group('status sets (C-V3, row 211)', () {
    test('working set mirrors RUNNER_ACTIVE_JOB_STATES', () {
      expect(RunnerJobsRepository.workingStatuses, {
        ErrandStatus.runnerEnRoute,
        ErrandStatus.arrived,
        ErrandStatus.inProgress,
      });
    });

    test('active set has no open offers and contains the working set', () {
      expect(
        RunnerJobsRepository.activeStatuses,
        isNot(contains(ErrandStatus.runnerAssigned)),
      );
      expect(
        RunnerJobsRepository.activeStatuses.containsAll(
          RunnerJobsRepository.workingStatuses,
        ),
        isTrue,
      );
      expect(
        RunnerJobsRepository.activeStatuses,
        containsAll([ErrandStatus.awaitingCustomer, ErrandStatus.disputed]),
      );
    });

    test('ended window states never include EXPIRED', () {
      expect(
        RunnerJobsRepository.recentlyEndedStatuses,
        isNot(contains(ErrandStatus.expired)),
      );
      expect(RunnerJobsRepository.endedJobWindow, const Duration(hours: 24));
    });
  });

  group('heldJobs (C-V3, A1)', () {
    const first = 'GET /runners/me/jobs?limit=50';

    test('one list call in runner projection, working job first; a stray '
        'offer is left out', () async {
      final a = FakeApiAdapter({
        first: _page([
          _job('aw', 'AWAITING_CUSTOMER'),
          _job('wk', 'IN_PROGRESS'),
          _job('of', 'RUNNER_ASSIGNED', assignment: 'assigned'),
          _job('cx', 'CANCELLED'),
        ]),
      });
      final jobs = await RunnerJobsRepository(fakeClient(a)).heldJobs();
      expect(jobs.map((j) => j.id), ['wk', 'aw', 'cx']);
      expect(jobs.first.runnerFee, '250.00');
      expect(a.calls, [first]);
    });

    test('reads every page', () async {
      final a = FakeApiAdapter({
        first: _page([_job('e1', 'AWAITING_CUSTOMER')], 'c2'),
        '$first&cursor=c2': _page([_job('e2', 'DISPUTED')]),
      });
      final jobs = await RunnerJobsRepository(fakeClient(a)).heldJobs();
      expect(jobs.map((j) => j.id), ['e1', 'e2']);
    });

    test('heldJobsPage passes limit and cursor and checks the limit', () async {
      final a = FakeApiAdapter({
        'GET /runners/me/jobs?limit=5&cursor=x': _page([
          _job('e1', 'ARRIVED'),
        ], 'y'),
      });
      final repo = RunnerJobsRepository(fakeClient(a));
      final p = await repo.heldJobsPage(limit: 5, cursor: 'x');
      expect(p.items.single.id, 'e1');
      expect(p.nextCursor, 'y');
      expect(() => repo.heldJobsPage(limit: 51), throwsRangeError);
      expect(() => repo.heldJobsPage(limit: 0), throwsRangeError);
    });

    test('errors are thrown', () async {
      final a = FakeApiAdapter({
        first: (500, {'message': 'boom'}),
      });
      await expectLater(
        RunnerJobsRepository(fakeClient(a)).heldJobs(),
        throwsA(isA<NitumeApiException>()),
      );
    });
  });

  group('readJob (C-V4)', () {
    test('an ended job stays readable', () async {
      final a = FakeApiAdapter({
        'GET /runners/me/jobs/e1': (200, _job('e1', 'SETTLED')),
      });
      final r = await RunnerJobsRepository(fakeClient(a)).readJob('e1');
      expect(r, isA<RunnerJobAvailable>());
      expect((r as RunnerJobAvailable).job.status, ErrandStatus.settled);
    });

    test('an uncoded 403 (older server) is access revoked too', () async {
      final a = FakeApiAdapter({'GET /runners/me/jobs/e1': _revokedOld});
      final r = await RunnerJobsRepository(fakeClient(a)).readJob('e1');
      expect(r, isA<RunnerJobAccessRevoked>());
    });

    test('the job_not_held 403 is access revoked', () async {
      final a = FakeApiAdapter({'GET /runners/me/jobs/e1': _revoked});
      final r = await RunnerJobsRepository(fakeClient(a)).readJob('e1');
      expect(r, isA<RunnerJobAccessRevoked>());
      expect((r as RunnerJobAccessRevoked).errandId, 'e1');
    });

    test('a coded 403 is not access revoked', () async {
      final a = FakeApiAdapter({
        'GET /runners/me/jobs/e1': (
          403,
          {
            'statusCode': 403,
            'code': ApiErrorCodes.roleMismatch,
            'message': 'Wrong app',
          },
        ),
      });
      await expectLater(
        RunnerJobsRepository(fakeClient(a)).readJob('e1'),
        throwsA(
          isA<NitumeApiException>().having(
            (e) => e.code,
            'code',
            ApiErrorCodes.roleMismatch,
          ),
        ),
      );
    });

    test('isAccessRevoked', () {
      expect(
        RunnerJobsRepository.isAccessRevoked(
          const NitumeApiException(message: 'x', statusCode: 403),
        ),
        isTrue,
      );
      expect(
        RunnerJobsRepository.isAccessRevoked(
          const NitumeApiException(
            message: 'x',
            statusCode: 403,
            code: ApiErrorCodes.jobNotHeld,
          ),
        ),
        isTrue,
      );
      expect(ApiErrorCodes.jobNotHeld, 'job_not_held');
      expect(
        RunnerJobsRepository.isAccessRevoked(
          const NitumeApiException(message: 'x', statusCode: 404),
        ),
        isFalse,
      );
      expect(RunnerJobsRepository.isAccessRevoked(StateError('x')), isFalse);
    });
  });
}
