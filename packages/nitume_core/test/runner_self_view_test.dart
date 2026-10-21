import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

const _checks = [
  {'type': 'phone', 'side': null, 'status': 'approved'},
  {'type': 'government_id', 'side': 'front', 'status': 'approved'},
  {'type': 'government_id', 'side': 'back', 'status': 'rejected'},
  {'type': 'selfie', 'side': null, 'status': 'pending'},
  {'type': 'payment_identity', 'side': null, 'status': 'missing'},
];

Map<String, dynamic> _self([Map<String, dynamic>? extra]) => {
  'id': 'rp1',
  'userId': 'u1',
  'displayName': 'Kevin Otieno',
  'shortName': 'Kevin O.',
  'verificationLevel': '2_id_verified',
  'availability': 'offline',
  'avgRating': '4.80',
  'errandsCompleted': 12,
  'completionRate': '97.50',
  'maxPurchaseAdvance': '5000.00',
  'lastPingAt': null,
  'skills': ['queue_admin', 'buy_for_me'],
  'serviceAreas': [
    {'id': 'nyali', 'name': 'Nyali'},
    {'id': 'bamburi', 'name': 'Bamburi'},
  ],
  'verification': {'verified': false, 'checks': _checks},
  ...?extra,
};

Future<NitumeApiException> _failure(Future<Object?> call) async {
  try {
    await call;
  } on NitumeApiException catch (e) {
    return e;
  }
  fail('expected a NitumeApiException');
}

void main() {
  group('RunnerMe (RunnerSelfView)', () {
    test('parses every self-view field', () {
      final me = RunnerMe.fromJson(_self());
      expect(me.displayName, 'Kevin Otieno');
      expect(me.shortName, 'Kevin O.');
      expect(me.availability, RunnerAvailability.offline);
      expect(me.isOnline, isFalse);
      expect(me.isBusy, isFalse);
      expect(me.avgRating, '4.80');
      expect(me.errandsCompleted, 12);
      expect(me.completionRate, '97.50');
      expect(me.maxPurchaseAdvance, '5000.00');
      expect(me.skills, [RunnerSkill.buyForMe, RunnerSkill.waitForMe]);
      expect(me.serviceAreas, const [
        ServiceAreaOption(id: 'nyali', name: 'Nyali'),
        ServiceAreaOption(id: 'bamburi', name: 'Bamburi'),
      ]);
      expect(me.isVerified, isFalse);
    });

    test('verification checks keep the API order', () {
      final v = RunnerMe.fromJson(_self()).verification;
      expect(
        [for (final c in v.checks) c.type],
        [
          RunnerVerificationType.phone,
          RunnerVerificationType.governmentId,
          RunnerVerificationType.governmentId,
          RunnerVerificationType.selfie,
          RunnerVerificationType.paymentIdentity,
        ],
      );
      expect(
        [for (final c in v.checks) c.side],
        [
          null,
          VerificationDocumentSide.front,
          VerificationDocumentSide.back,
          null,
          null,
        ],
      );
      expect(
        [for (final c in v.checks) c.status],
        [
          VerificationCheckStatus.approved,
          VerificationCheckStatus.approved,
          VerificationCheckStatus.rejected,
          VerificationCheckStatus.pending,
          VerificationCheckStatus.missing,
        ],
      );
      expect(
        v
            .checkFor(
              RunnerVerificationType.governmentId,
              side: VerificationDocumentSide.back,
            )!
            .status,
        VerificationCheckStatus.rejected,
      );
      expect(v.checkFor(RunnerVerificationType.phone)!.isApproved, isTrue);
      expect(v.checkFor(RunnerVerificationType.reference), isNull);
    });

    test('level2Missing: parsed in order, unknown values skipped', () {
      final v = RunnerVerificationSummary.fromJson({
        'verified': false,
        'checks': <Object>[],
        'level2Missing': ['government_id_back', 'passport', 7, 'selfie'],
      });
      expect(v.level2Missing, [
        Level2Check.governmentIdBack,
        Level2Check.selfie,
      ]);
      expect(v.meetsLevel2, isFalse);

      final met = RunnerVerificationSummary.fromJson({
        'verified': false,
        'level2Missing': <Object>[],
      });
      expect(met.level2Missing, isEmpty);
      expect(met.meetsLevel2, isTrue);
    });

    test('level2Missing absent or malformed reads as unknown', () {
      expect(
        RunnerVerificationSummary.fromJson({'verified': true}).level2Missing,
        isNull,
      );
      final odd = RunnerVerificationSummary.fromJson({
        'verified': false,
        'level2Missing': 'selfie',
      });
      expect(odd.level2Missing, isNull);
      expect(odd.meetsLevel2, isNull);
      expect(RunnerVerificationSummary.unknown.level2Missing, isNull);
      expect(Level2Check.values.map((e) => e.wire), [
        'government_id_front',
        'government_id_back',
        'selfie',
      ]);
    });

    test('level2Missing on GET /runners/me', () {
      final me = RunnerMe.fromJson(
        _self({
          'verification': {
            'verified': false,
            'checks': <Object>[],
            'level2Missing': ['government_id_front'],
          },
        }),
      );
      expect(me.verification.level2Missing, [Level2Check.governmentIdFront]);
    });

    test('verified comes from the API', () {
      final me = RunnerMe.fromJson(
        _self({
          'availability': 'busy',
          'verification': {'verified': true, 'checks': <Object>[]},
        }),
      );
      expect(me.isVerified, isTrue);
      expect(me.isBusy, isTrue);
    });

    test('unknown values never throw', () {
      final me = RunnerMe.fromJson(
        _self({
          'availability': 'away',
          'skills': ['shopping', 'inspection'],
          'serviceAreas': [
            'Nyali',
            {'id': 'x'},
            {'id': 'kisauni', 'name': 'Kisauni'},
          ],
          'verification': {
            'verified': 'yes',
            'checks': [
              {'type': 'retina', 'side': 'left', 'status': 'maybe'},
              {'type': 7, 'side': 1, 'status': false},
              'junk',
            ],
          },
        }),
      );
      expect(me.availability, RunnerAvailability.offline);
      expect(me.skills, [RunnerSkill.checkItForMe]);
      expect(me.serviceAreas, const [
        ServiceAreaOption(id: 'kisauni', name: 'Kisauni'),
      ]);
      expect(me.isVerified, isFalse);
      expect(me.verification.checks, hasLength(2));
      for (final c in me.verification.checks) {
        expect(c.type, isNull);
        expect(c.side, isNull);
        expect(c.status, VerificationCheckStatus.missing);
      }
    });

    test('VerificationCheckStatus wire values', () {
      for (final s in VerificationCheckStatus.values) {
        expect(VerificationCheckStatus.tryFromWire(s.wire), s);
      }
      expect(VerificationCheckStatus.tryFromWire('nope'), isNull);
      expect(
        RunnerVerificationSummary.fromJsonOrUnknown(null),
        same(RunnerVerificationSummary.unknown),
      );
    });
  });

  group('RunnerAccountRepository', () {
    test('me reads the self view', () async {
      final a = FakeApiAdapter({'GET /runners/me': (200, _self())});
      final me = await RunnerAccountRepository(fakeClient(a)).me();
      expect(me.shortName, 'Kevin O.');
      expect(me.verification.checks, hasLength(5));
    });

    test('setAvailability sends online / offline only', () async {
      final a = FakeApiAdapter({
        'PATCH /runners/me/availability': (
          200,
          _self({'availability': 'online'}),
        ),
      });
      final repo = RunnerAccountRepository(fakeClient(a));
      final me = await repo.setAvailability(RunnerAvailability.online);
      expect(a.bodies.single, {'availability': 'online'});
      expect(me.isOnline, isTrue);
      // A failed Future, not a synchronous throw.
      final busy = repo.setAvailability(RunnerAvailability.busy);
      expect(busy, isA<Future<RunnerMe>>());
      await expectLater(busy, throwsArgumentError);
      expect(a.calls, hasLength(1));
    });

    test('setAvailability errors carry their codes and details', () async {
      Future<NitumeApiException> refused(int status, Map<String, Object?> b) {
        final a = FakeApiAdapter({
          'PATCH /runners/me/availability': (
            status,
            {'statusCode': status, ...b},
          ),
        });
        return _failure(
          RunnerAccountRepository(fakeClient(a))
              .setAvailability(RunnerAvailability.online),
        );
      }

      final managed = await refused(400, {
        'code': 'availability_server_managed',
        'allowed': ['online', 'offline'],
      });
      expect(managed.code, ApiErrorCodes.availabilityServerManaged);
      expect(managed.allowed, ['online', 'offline']);

      final unverified = await refused(403, {
        'code': 'runner_not_verified',
        'verification': {'verified': false, 'checks': _checks},
      });
      expect(unverified.code, ApiErrorCodes.runnerNotVerified);
      expect(unverified.statusCode, 403);
      final summary = unverified.verificationSummary!;
      expect(summary.verified, isFalse);
      expect(summary.checks[3].status, VerificationCheckStatus.pending);

      final active = await refused(409, {'code': 'runner_on_active_job'});
      expect(active.code, ApiErrorCodes.runnerOnActiveJob);
      expect(active.verificationSummary, isNull);
    });

    test('setSkills takes 1 to 5 distinct skills', () async {
      final a = FakeApiAdapter({
        'PUT /runners/me/skills': (200, ['buy_for_me', 'pickup_delivery']),
      });
      final repo = RunnerAccountRepository(fakeClient(a));
      expect(
        await repo.setSkills([
          RunnerSkill.getItForMe,
          RunnerSkill.buyForMe,
          RunnerSkill.getItForMe,
        ]),
        [RunnerSkill.buyForMe, RunnerSkill.getItForMe],
      );
      expect(a.bodies.single, {
        'skills': ['pickup_delivery', 'buy_for_me'],
      });
      expect(() => repo.setSkills(const []), throwsArgumentError);
      expect(() => repo.setSkills(RunnerSkill.values), throwsArgumentError);
      expect(RunnerAccountRepository.maxSkills, 5);
    });

    test('setSkills accepts exactly 5 skills', () async {
      final a = FakeApiAdapter({
        'PUT /runners/me/skills': (
          200,
          [for (final s in RunnerSkill.offered) s.wire],
        ),
      });
      final saved = await RunnerAccountRepository(fakeClient(a))
          .setSkills(RunnerSkill.offered);
      expect(saved, RunnerSkill.offered);
      expect((a.bodies.single as Map)['skills'], hasLength(5));
    });

    test('setSkills maps skill_not_offered', () async {
      final a = FakeApiAdapter({
        'PUT /runners/me/skills': (
          400,
          {
            'statusCode': 400,
            'code': 'skill_not_offered',
            'refused': ['business'],
            'allowed': [for (final s in RunnerSkill.offered) s.wire],
          },
        ),
      });
      final e = await _failure(
        RunnerAccountRepository(fakeClient(a))
            .setSkills([RunnerSkill.businessTasks]),
      );
      expect(e.code, ApiErrorCodes.skillNotOffered);
      expect(e.refusedSkills, [RunnerSkill.businessTasks]);
      expect(e.allowed, hasLength(5));
    });

    test('serviceAreas lists the ops areas', () async {
      final a = FakeApiAdapter({
        'GET /runners/service-areas': (
          200,
          {
            'items': [
              {'id': 'bamburi', 'name': 'Bamburi'},
              {'id': 'nyali', 'name': 'Nyali'},
            ],
          },
        ),
      });
      final areas = await RunnerAccountRepository(fakeClient(a)).serviceAreas();
      expect([for (final x in areas) x.id], ['bamburi', 'nyali']);
      expect(areas.first.name, 'Bamburi');
    });

    test('setServiceAreas sends ids and returns id + name', () async {
      final a = FakeApiAdapter({
        'PUT /runners/me/service-areas': (
          200,
          [
            {'id': 'nyali', 'name': 'Nyali'},
          ],
        ),
      });
      final repo = RunnerAccountRepository(fakeClient(a));
      expect(await repo.setServiceAreas(['nyali']), const [
        ServiceAreaOption(id: 'nyali', name: 'Nyali'),
      ]);
      expect(a.bodies.single, {
        'areas': ['nyali'],
      });
      expect(
        () => repo.setServiceAreas([for (var i = 0; i < 51; i++) 'a$i']),
        throwsArgumentError,
      );
    });

    test('setServiceAreas accepts exactly 50 areas', () async {
      final ids = [for (var i = 0; i < 50; i++) 'a$i'];
      final a = FakeApiAdapter({
        'PUT /runners/me/service-areas': (
          200,
          [
            for (final id in ids) {'id': id, 'name': id.toUpperCase()},
          ],
        ),
      });
      final saved = await RunnerAccountRepository(fakeClient(a))
          .setServiceAreas(ids);
      expect(saved, hasLength(50));
      expect((a.bodies.single as Map)['areas'], ids);
      expect(RunnerAccountRepository.maxServiceAreas, 50);
    });

    test('setServiceAreas maps service_area_unknown', () async {
      final a = FakeApiAdapter({
        'PUT /runners/me/service-areas': (
          400,
          {
            'statusCode': 400,
            'code': 'service_area_unknown',
            'unknown': ['atlantis'],
          },
        ),
      });
      final e = await _failure(
        RunnerAccountRepository(fakeClient(a)).setServiceAreas(['atlantis']),
      );
      expect(e.code, ApiErrorCodes.serviceAreaUnknown);
      expect(e.unknownServiceAreas, ['atlantis']);
    });
  });

  test('account error codes match the API', () {
    expect(
      ApiErrorCodes.availabilityServerManaged,
      'availability_server_managed',
    );
    expect(ApiErrorCodes.runnerNotVerified, 'runner_not_verified');
    expect(ApiErrorCodes.runnerOnActiveJob, 'runner_on_active_job');
    expect(ApiErrorCodes.skillNotOffered, 'skill_not_offered');
    expect(ApiErrorCodes.serviceAreaUnknown, 'service_area_unknown');
  });
}
