import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

const _active =
    'GET /errands?status=RUNNER_EN_ROUTE%2CARRIVED%2CIN_PROGRESS'
    '%2CAWAITING_CUSTOMER%2CDISPUTED&limit=100';
const _ended =
    'GET /errands?status=COMPLETED%2CCONFIRMED%2CSETTLED%2CCANCELLED'
    '%2CFAILED&limit=100';

Map<String, dynamic> _errand(String id, String status, {String? updatedAt}) => {
  'id': id,
  'customerId': 'c1',
  'category': 'buy_for_me',
  'description': 'Buy milk',
  'status': status,
  'urgency': 'standard',
  'budget': null,
  'updatedAt': ?updatedAt,
};

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
    'message': 'You do not have access to this errand',
    'error': 'Forbidden',
  },
);

void main() {
  final now = DateTime.utc(2026, 10, 19, 10);

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

  group('heldJobs (C-V3)', () {
    test('accepted jobs in runner projection, working job first; offers, '
        'old ended jobs and revoked jobs left out', () async {
      final a = FakeApiAdapter({
        _active: _page([
          _errand('aw', 'AWAITING_CUSTOMER'),
          _errand('wk', 'IN_PROGRESS'),
          _errand('rv', 'DISPUTED'),
        ]),
        _ended: _page([
          _errand('cx', 'CANCELLED', updatedAt: '2026-10-19T02:00:00.000Z'),
          _errand('old', 'FAILED', updatedAt: '2026-10-18T09:59:00.000Z'),
          _errand('nu', 'SETTLED'),
        ]),
        'GET /runners/me/jobs/aw': (200, _job('aw', 'AWAITING_CUSTOMER')),
        'GET /runners/me/jobs/wk': (200, _job('wk', 'IN_PROGRESS')),
        'GET /runners/me/jobs/rv': _revoked,
        'GET /runners/me/jobs/cx': (200, _job('cx', 'CANCELLED')),
      });
      final jobs = await RunnerJobsRepository(fakeClient(a)).heldJobs(now: now);
      expect(jobs.map((j) => j.id), ['wk', 'aw', 'cx']);
      expect(jobs.first.runnerFee, '250.00');
      expect(a.calls, isNot(contains('GET /runners/me/jobs/old')));
      expect(a.calls, isNot(contains('GET /runners/me/jobs/nu')));
    });

    test('a job whose assignment is still an offer is dropped', () async {
      final a = FakeApiAdapter({
        _active: _page([_errand('e1', 'RUNNER_EN_ROUTE')]),
        _ended: _page([]),
        'GET /runners/me/jobs/e1': (
          200,
          _job('e1', 'RUNNER_EN_ROUTE', assignment: 'assigned'),
        ),
      });
      expect(
        await RunnerJobsRepository(fakeClient(a)).heldJobs(now: now),
        isEmpty,
      );
    });

    test('a job that moved out of the held states meanwhile is dropped '
        '(e.g. back to RUNNER_ASSIGNED for another runner)', () async {
      final a = FakeApiAdapter({
        _active: _page([_errand('e1', 'ARRIVED')]),
        _ended: _page([]),
        'GET /runners/me/jobs/e1': (200, _job('e1', 'EXPIRED')),
      });
      expect(
        await RunnerJobsRepository(fakeClient(a)).heldJobs(now: now),
        isEmpty,
      );
    });

    test('reads every page of the active set', () async {
      final a = FakeApiAdapter({
        _active: _page([_errand('e1', 'AWAITING_CUSTOMER')], 'c2'),
        '$_active&cursor=c2': _page([_errand('e2', 'DISPUTED')]),
        _ended: _page([]),
        'GET /runners/me/jobs/e1': (200, _job('e1', 'AWAITING_CUSTOMER')),
        'GET /runners/me/jobs/e2': (200, _job('e2', 'DISPUTED')),
      });
      final jobs = await RunnerJobsRepository(fakeClient(a)).heldJobs(now: now);
      expect(jobs.map((j) => j.id), ['e1', 'e2']);
    });

    test('other errors are thrown', () async {
      final a = FakeApiAdapter({
        _active: _page([_errand('e1', 'IN_PROGRESS')]),
        _ended: _page([]),
        'GET /runners/me/jobs/e1': (500, {'message': 'boom'}),
      });
      await expectLater(
        RunnerJobsRepository(fakeClient(a)).heldJobs(now: now),
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

    test('the reassigned 403 is access revoked', () async {
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
          const NitumeApiException(message: 'x', statusCode: 404),
        ),
        isFalse,
      );
      expect(RunnerJobsRepository.isAccessRevoked(StateError('x')), isFalse);
    });
  });
}
