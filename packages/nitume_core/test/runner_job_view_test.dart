import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

Map<String, dynamic> _job([Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'reference': 'NT-0042',
  'status': 'RUNNER_ASSIGNED',
  'category': 'buy_for_me',
  'title': 'Groceries',
  'description': 'Buy milk and bread',
  'urgency': 'urgent',
  'deadlineAt': '2026-10-16T12:00:00.000Z',
  'createdAt': '2026-10-16T08:00:00.000Z',
  'locations': [
    {
      'id': 'l1',
      'pointType': 'dropoff',
      'lat': -4.04,
      'lng': 39.7,
      'addressText': 'Nyali Rd',
      'placeId': null,
    },
    {
      'id': 'l2',
      'pointType': 'pickup',
      'lat': -4.05,
      'lng': 39.66,
      'addressText': 'Naivas Nyali',
      'placeId': 'p1',
    },
  ],
  'firstPoint': {
    'id': 'l2',
    'pointType': 'pickup',
    'lat': -4.05,
    'lng': 39.66,
    'addressText': 'Naivas Nyali',
    'placeId': 'p1',
  },
  'items': [
    {'id': 'i1', 'name': 'Milk', 'quantity': 2, 'unit': 'L', 'notes': null},
  ],
  'runnerNotes': null,
  'runnerFee': '250.00',
  'itemAmount': '1200.00',
  'merchantRoute': 'send_to_runner',
  'requiredPurchase': '1200.00',
  'maxPurchaseAdvance': '1000.00',
  'overPurchaseLimit': true,
  'offerExpiresAt': '2026-10-16T08:10:00.000Z',
  'assignment': {
    'id': 'a1',
    'status': 'assigned',
    'offeredAt': '2026-10-16T08:05:00.000Z',
    'offerExpiresAt': '2026-10-16T08:10:00.000Z',
    'decidedAt': null,
  },
  ...?extra,
};

const _history = {
  'id': 'h1',
  'errandId': 'e1',
  'fromStatus': 'RUNNER_ASSIGNED',
  'toStatus': 'RUNNER_EN_ROUTE',
  'actorType': 'runner',
  'actorId': 'u1',
  'note': null,
  'createdAt': '2026-10-16T08:06:00.000Z',
};

Future<NitumeApiException> _failure(Future<Object?> call) async {
  try {
    await call;
  } on NitumeApiException catch (e) {
    return e;
  }
  fail('expected a NitumeApiException');
}

Future<NitumeApiException> _acceptError(Map<String, Object?> body) {
  final status = body['statusCode'] as int;
  final a = FakeApiAdapter({'POST /errands/e1/accept': (status, body)});
  return _failure(RunnerJobsRepository(fakeClient(a)).accept('e1'));
}

void main() {
  final offerExpiry = DateTime.utc(2026, 10, 16, 8, 10);
  final deadline = DateTime.utc(2026, 10, 16, 12);

  group('RunnerJobView', () {
    test('parses every contract field', () {
      final j = RunnerJobView.fromJson(_job());
      expect(j.id, 'e1');
      expect(j.reference, 'NT-0042');
      expect(j.status, ErrandStatus.runnerAssigned);
      expect(j.category, ErrandCategory.buyForMe);
      expect(j.title, 'Groceries');
      expect(j.description, 'Buy milk and bread');
      expect(j.urgency, ErrandUrgency.urgent);
      expect(j.deadlineAt, deadline);
      expect(j.createdAt, DateTime.utc(2026, 10, 16, 8));
      expect(j.locations, hasLength(2));
      expect(j.firstPoint!.pointType, ErrandPointType.pickup);
      expect(j.firstPoint!.addressText, 'Naivas Nyali');
      expect(j.items.single.name, 'Milk');
      expect(j.items.single.quantity, 2);
      expect(j.runnerNotes, isNull);
      expect(j.runnerFee, '250.00');
      expect(j.itemAmount, '1200.00');
      expect(j.merchantRoute, MerchantRoute.sendToRunner);
      expect(j.requiredPurchase, '1200.00');
      expect(j.maxPurchaseAdvance, '1000.00');
      expect(j.overPurchaseLimit, isTrue);
      expect(j.offerExpiresAt, offerExpiry);
      expect(j.assignment.id, 'a1');
      expect(j.assignment.status, AssignmentStatus.assigned);
      expect(j.assignment.offeredAt, DateTime.utc(2026, 10, 16, 8, 5));
      expect(j.assignment.offerExpiresAt, offerExpiry);
      expect(j.assignment.decidedAt, isNull);
      expect(j.isOpenOffer, isTrue);
    });

    test('money stays a decimal string; absent item fields are null', () {
      final j = RunnerJobView.fromJson(
        _job({
          'runnerFee': 300,
          'itemAmount': null,
          'merchantRoute': null,
          'requiredPurchase': '0.00',
          'overPurchaseLimit': false,
          'locations': [
            {'pointType': 'moon', 'addressText': 'x'},
          ],
          'firstPoint': null,
        }),
      );
      expect(j.runnerFee, '300.00');
      expect(j.itemAmount, isNull);
      expect(j.merchantRoute, isNull);
      expect(j.requiredPurchase, '0.00');
      expect(j.overPurchaseLimit, isFalse);
      expect(j.locations, isEmpty);
      expect(j.firstPoint, isNull);
    });

    test('a non-string merchantRoute reads as null', () {
      final j = RunnerJobView.fromJson(_job({'merchantRoute': 1}));
      expect(j.merchantRoute, isNull);
      expect(MerchantRoute.tryFromWire(true), isNull);
      expect(RunnerVerificationType.tryFromWire(3), isNull);
    });

    test('an unknown status, category or urgency still throws', () {
      for (final bad in [
        {'status': 'NOPE'},
        {'category': 'shopping'},
        {'urgency': 'whenever'},
      ]) {
        expect(() => RunnerJobView.fromJson(_job(bad)), throwsA(anything));
      }
    });

    group('offerEndsAt', () {
      test('is the offer expiry when it comes first', () {
        expect(RunnerJobView.fromJson(_job()).offerEndsAt, offerExpiry);
      });

      test('is the task deadline when it comes first', () {
        final j = RunnerJobView.fromJson(
          _job({'deadlineAt': '2026-10-16T08:07:00.000Z'}),
        );
        expect(j.offerEndsAt, DateTime.utc(2026, 10, 16, 8, 7));
      });

      test('uses whichever one is set', () {
        expect(
          RunnerJobView.fromJson(_job({'offerExpiresAt': null})).offerEndsAt,
          deadline,
        );
        expect(
          RunnerJobView.fromJson(_job({'deadlineAt': null})).offerEndsAt,
          offerExpiry,
        );
        final never = RunnerJobView.fromJson(
          _job({'deadlineAt': null, 'offerExpiresAt': null}),
        );
        expect(never.offerEndsAt, isNull);
        expect(never.offerTimeLeftAt(deadline), isNull);
        expect(never.offerEndedAt(deadline), isFalse);
      });

      test('is null once the offer is accepted', () {
        final j = RunnerJobView.fromJson(
          _job({
            'status': 'RUNNER_EN_ROUTE',
            'offerExpiresAt': null,
            'assignment': {
              'id': 'a1',
              'status': 'accepted',
              'offerExpiresAt': '2026-10-16T08:10:00.000Z',
              'decidedAt': '2026-10-16T08:06:00.000Z',
            },
          }),
        );
        expect(j.isOpenOffer, isFalse);
        expect(j.offerEndsAt, isNull);
        expect(j.assignment.decidedAt, DateTime.utc(2026, 10, 16, 8, 6));
      });

      test('time left and ended', () {
        final j = RunnerJobView.fromJson(_job());
        final before = DateTime.utc(2026, 10, 16, 8, 8);
        expect(j.offerTimeLeftAt(before), const Duration(minutes: 2));
        expect(j.offerEndedAt(before), isFalse);
        expect(j.offerTimeLeftAt(deadline), Duration.zero);
        expect(j.offerEndedAt(offerExpiry), isTrue);
      });
    });

    test('offers page skips entries it cannot read', () {
      final page = RunnerOffersPage.fromJson({
        'items': [
          _job(),
          {'id': 'bad'},
          _job({'id': 'e2', 'status': 'NOPE'}),
        ],
        'nextCursor': 'c2',
      });
      expect([for (final j in page.items) j.id], ['e1']);
      expect(page.hasMore, isTrue);
      expect(
        RunnerOffersPage.fromJson({'items': [], 'nextCursor': null}).hasMore,
        isFalse,
      );
    });

    test('OfferDeclineReason wire values', () {
      expect(OfferDeclineReason.overPurchaseLimit.wire, 'over_purchase_limit');
      expect(
        OfferDeclineReason.tryFromWire('over_purchase_limit'),
        OfferDeclineReason.overPurchaseLimit,
      );
      expect(OfferDeclineReason.tryFromWire('tired'), isNull);
    });

    test('OfferDeclineReason row-210 values, parsed tolerantly', () {
      expect(
        {for (final r in OfferDeclineReason.values) r.wire},
        {'over_purchase_limit', 'too_far', 'not_available', 'other'},
      );
      expect(
        OfferDeclineReason.tryFromWire('too_far'),
        OfferDeclineReason.tooFar,
      );
      expect(
        OfferDeclineReason.tryFromWire(' NOT_AVAILABLE '),
        OfferDeclineReason.notAvailable,
      );
      expect(OfferDeclineReason.tryFromWire('other'), OfferDeclineReason.other);
      expect(OfferDeclineReason.tryFromWire(null), isNull);
      expect(OfferDeclineReason.tryFromWire(3), isNull);
      expect(OfferDeclineReason.tryFromWire(''), isNull);
    });
  });

  group('RunnerJobsRepository offers and jobs', () {
    test('offers reads a page and passes limit and cursor', () async {
      final a = FakeApiAdapter({
        'GET /runners/me/offers': (
          200,
          {
            'items': [_job()],
            'nextCursor': 'c2',
          },
        ),
        'GET /runners/me/offers?limit=10&cursor=c2': (
          200,
          {'items': <Object>[], 'nextCursor': null},
        ),
      });
      final repo = RunnerJobsRepository(fakeClient(a));
      final first = await repo.offers();
      expect(first.items.single.reference, 'NT-0042');
      expect(first.nextCursor, 'c2');
      final next = await repo.offers(limit: 10, cursor: first.nextCursor);
      expect(next.items, isEmpty);
      expect(next.hasMore, isFalse);
      expect(() => repo.offers(limit: 0), throwsRangeError);
      expect(() => repo.offers(limit: 51), throwsRangeError);
      expect(a.calls, hasLength(2));
    });

    test('offers maps runner_not_verified', () async {
      final a = FakeApiAdapter({
        'GET /runners/me/offers': (
          403,
          {
            'statusCode': 403,
            'code': 'runner_not_verified',
            'verification': {'verified': false, 'checks': <Object>[]},
          },
        ),
      });
      final e = await _failure(RunnerJobsRepository(fakeClient(a)).offers());
      expect(e.code, ApiErrorCodes.runnerNotVerified);
      expect(e.verificationSummary!.verified, isFalse);
    });

    test('job reads the runner view', () async {
      final a = FakeApiAdapter({'GET /runners/me/jobs/e1': (200, _job())});
      final j = await RunnerJobsRepository(fakeClient(a)).job('e1');
      expect(j.runnerFee, '250.00');
    });

    test('accept returns the job and history', () async {
      final a = FakeApiAdapter({
        'POST /errands/e1/accept': (
          200,
          {
            'job': _job({
              'status': 'RUNNER_EN_ROUTE',
              'offerExpiresAt': null,
              'assignment': {'id': 'a1', 'status': 'accepted'},
            }),
            'history': _history,
          },
        ),
      });
      final r = await RunnerJobsRepository(fakeClient(a)).accept('e1');
      expect(r.job.status, ErrandStatus.runnerEnRoute);
      expect(r.job.assignment.status, AssignmentStatus.accepted);
      expect(r.history.toStatus, ErrandStatus.runnerEnRoute);
      expect(r.history.actorType, StatusHistoryActor.runner);
    });

    test('decline sends the reason only when given', () async {
      final reply = {
        'errandId': 'e1',
        'runnerProfileId': 'rp1',
        'requiredPurchase': '1200.00',
        'maxPurchaseAdvance': '1000.00',
        'overLimit': true,
        'assignmentId': 'a1',
        'status': 'declined',
        'declineReason': 'over_purchase_limit',
      };
      final a = FakeApiAdapter({'POST /errands/e1/decline': (200, reply)});
      final repo = RunnerJobsRepository(fakeClient(a));
      final r = await repo.decline(
        'e1',
        reason: OfferDeclineReason.overPurchaseLimit,
      );
      expect(a.bodies.last, {'reason': 'over_purchase_limit'});
      expect(r.errandId, 'e1');
      expect(r.runnerProfileId, 'rp1');
      expect(r.assignmentId, 'a1');
      expect(r.status, AssignmentStatus.declined);
      expect(r.declineReason, OfferDeclineReason.overPurchaseLimit);
      expect(r.requiredPurchase, '1200.00');
      expect(r.maxPurchaseAdvance, '1000.00');
      expect(r.overLimit, isTrue);

      await repo.decline('e1', reason: OfferDeclineReason.other);
      expect(a.bodies.last, {'reason': 'other'});
    });

    test('decline sends each row-210 reason and reads it back', () async {
      for (final reason in OfferDeclineReason.values) {
        final a = FakeApiAdapter({
          'POST /errands/e1/decline': (
            200,
            {
              'errandId': 'e1',
              'runnerProfileId': 'rp1',
              'assignmentId': 'a1',
              'status': 'declined',
              'declineReason': reason.wire,
            },
          ),
        });
        final r = await RunnerJobsRepository(fakeClient(a))
            .decline('e1', reason: reason);
        expect(a.bodies.last, {'reason': reason.wire});
        expect(r.declineReason, reason);
      }
    });
  });

  group('accept errors', () {
    test('offer_expired: lapsed offer', () async {
      final e = await _acceptError({
        'statusCode': 409,
        'code': 'offer_expired',
        'offerExpiresAt': '2026-10-16T08:10:00.000Z',
      });
      expect(e.code, ApiErrorCodes.offerExpired);
      expect(e.offerExpiresAt, offerExpiry);
      expect(e.isTaskDeadlinePassed, isFalse);
      expect(e.deadlineAt, isNull);
    });

    test('offer_expired: task deadline passed', () async {
      final e = await _acceptError({
        'statusCode': 409,
        'code': 'offer_expired',
        'offerExpiresAt': null,
        'reason': 'task_deadline_passed',
        'deadlineAt': '2026-10-16T12:00:00.000Z',
      });
      expect(e.code, ApiErrorCodes.offerExpired);
      expect(
        e.reasonDetail,
        ApiErrorCodes.offerExpiredReasonTaskDeadlinePassed,
      );
      expect(e.isTaskDeadlinePassed, isTrue);
      expect(e.deadlineAt, deadline);
      expect(e.offerExpiresAt, isNull);
    });

    test('runner_not_verified, runner_busy, runner_offline', () async {
      expect(
        (await _acceptError({
          'statusCode': 403,
          'code': 'runner_not_verified',
          'verification': {'verified': false, 'checks': <Object>[]},
        })).verificationSummary,
        isNotNull,
      );
      expect(
        (await _acceptError({'statusCode': 409, 'code': 'runner_busy'})).code,
        ApiErrorCodes.runnerBusy,
      );
      expect(
        (await _acceptError({'statusCode': 409, 'code': 'runner_offline'}))
            .code,
        ApiErrorCodes.runnerOffline,
      );
    });

    test('purchase_limit_exceeded carries both amounts', () async {
      final e = await _acceptError({
        'statusCode': 409,
        'code': 'purchase_limit_exceeded',
        'requiredPurchase': '1200.00',
        'maxPurchaseAdvance': '1000.00',
      });
      expect(e.code, ApiErrorCodes.purchaseLimitExceeded);
      expect(e.requiredPurchase, '1200.00');
      expect(e.maxPurchaseAdvance, '1000.00');
    });
  });

  group('decline and assign errors', () {
    Future<NitumeApiException> declineError(Map<String, Object?> body) {
      final a = FakeApiAdapter({
        'POST /errands/e1/decline': (body['statusCode'] as int, body),
      });
      return _failure(
        RunnerJobsRepository(fakeClient(a))
            .decline('e1', reason: OfferDeclineReason.tooFar),
      );
    }

    test('decline_reason_invalid lists the allowed reasons', () async {
      final e = await declineError({
        'statusCode': 400,
        'code': 'decline_reason_invalid',
        'allowed': ['over_purchase_limit'],
      });
      expect(e.code, ApiErrorCodes.declineReasonInvalid);
      expect(e.allowed, ['over_purchase_limit']);
    });

    test('purchase_within_limit and assignment_not_declinable', () async {
      final within = await declineError({
        'statusCode': 409,
        'code': 'purchase_within_limit',
        'requiredPurchase': 500,
        'maxPurchaseAdvance': '1000.00',
      });
      expect(within.code, ApiErrorCodes.purchaseWithinLimit);
      expect(within.requiredPurchase, '500.00');
      expect(within.maxPurchaseAdvance, '1000.00');

      final late = await declineError({
        'statusCode': 409,
        'code': 'assignment_not_declinable',
        'status': 'RUNNER_EN_ROUTE',
      });
      expect(late.code, ApiErrorCodes.assignmentNotDeclinable);
    });

    test('runner_not_eligible and task_deadline_passed', () async {
      final notEligible = await declineError({
        'statusCode': 409,
        'code': 'runner_not_eligible',
        'reason': 'runner_busy',
        'runnerProfileId': 'rp1',
      });
      expect(notEligible.code, ApiErrorCodes.runnerNotEligible);
      expect(notEligible.reasonDetail, 'runner_busy');
      expect(notEligible.isTaskDeadlinePassed, isFalse);

      final past = await declineError({
        'statusCode': 409,
        'code': 'task_deadline_passed',
        'deadlineAt': '2026-10-16T12:00:00.000Z',
      });
      expect(past.code, ApiErrorCodes.taskDeadlinePassed);
      expect(past.isTaskDeadlinePassed, isTrue);
      expect(past.deadlineAt, deadline);
    });
  });

  test('job error codes match the API', () {
    expect(ApiErrorCodes.offerExpired, 'offer_expired');
    expect(
      ApiErrorCodes.offerExpiredReasonTaskDeadlinePassed,
      'task_deadline_passed',
    );
    expect(ApiErrorCodes.runnerBusy, 'runner_busy');
    expect(ApiErrorCodes.runnerOffline, 'runner_offline');
    expect(ApiErrorCodes.purchaseLimitExceeded, 'purchase_limit_exceeded');
    expect(ApiErrorCodes.declineReasonInvalid, 'decline_reason_invalid');
    expect(ApiErrorCodes.purchaseWithinLimit, 'purchase_within_limit');
    expect(ApiErrorCodes.assignmentNotDeclinable, 'assignment_not_declinable');
    expect(ApiErrorCodes.runnerNotEligible, 'runner_not_eligible');
    expect(ApiErrorCodes.taskDeadlinePassed, 'task_deadline_passed');
  });
}
