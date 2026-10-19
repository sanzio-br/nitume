import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final calls = <String>[];
  final bodies = <Object?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final query = options.uri.query;
    final key =
        '${options.method} ${options.path}${query.isEmpty ? '' : '?$query'}';
    calls.add(key);
    bodies.add(options.data);
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

NitumeApiClient _client(_Adapter a) => NitumeApiClient(
  config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
  tokenStore: InMemoryTokenStore(),
  httpClientAdapter: a,
);

const _profile = {
  'id': 'rp1',
  'userId': 'u1',
  'verificationLevel': '3_trusted',
  'trustScore': '0.9000',
  'completionRate': '98.70',
  'onTimeRate': '90.00',
  'cancellationRate': '1.00',
  'avgRating': '4.90',
  'errandsCompleted': 137,
  'maxPurchaseAdvance': '3000.00',
  'availability': 'online',
  'currentLocation': null,
  'lastPingAt': null,
};

Map<String, dynamic> _errand([Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'inspection',
  'description': 'Check the apartment',
  'status': 'IN_PROGRESS',
  'urgency': 'standard',
  'budget': '3000.00',
  ...?extra,
};

void main() {
  group('RunnerAccountRepository', () {
    test('me tolerates a profile without the self-view fields', () async {
      final a = _Adapter({'GET /runners/me': (200, _profile)});
      final me = await RunnerAccountRepository(_client(a)).me();
      expect(me.id, 'rp1');
      expect(me.verificationLevel, VerificationLevel.trusted);
      expect(me.isOnline, isTrue);
      expect(me.completionRate, '98.70');
      expect(me.maxPurchaseAdvance, '3000.00');
      expect(me.skills, isEmpty);
      expect(me.serviceAreas, isEmpty);
      expect(me.shortName, isNull);
      expect(me.displayName, isNull);
      expect(me.isVerified, isFalse);
      expect(me.verification.checks, isEmpty);
    });

    test('setAvailability patches the wire value', () async {
      final a = _Adapter({
        'PATCH /runners/me/availability': (
          200,
          {..._profile, 'availability': 'offline'},
        ),
      });
      final me = await RunnerAccountRepository(_client(a))
          .setAvailability(RunnerAvailability.offline);
      expect(a.bodies.single, {'availability': 'offline'});
      expect(me.isOnline, isFalse);
    });

    test('verifications, latestByType and addVerification', () async {
      final a = _Adapter({
        'GET /runners/me/verifications': (
          200,
          [
            {
              'id': 'v2',
              'verificationType': 'government_id',
              'status': 'rejected',
              'reviewerNote': 'internal',
              'createdAt': '2026-10-12T08:00:00.000Z',
            },
            {
              'id': 'v1',
              'verificationType': 'government_id',
              'status': 'pending',
              'createdAt': '2026-10-10T08:00:00.000Z',
            },
            {
              'id': 'v3',
              'verificationType': 'selfie',
              'status': 'approved',
              'createdAt': '2026-10-11T08:00:00.000Z',
            },
          ],
        ),
        'POST /runners/me/verifications': (
          201,
          {
            'id': 'v4',
            'verificationType': 'payment_identity',
            'status': 'pending',
          },
        ),
      });
      final repo = RunnerAccountRepository(_client(a));
      final list = await repo.verifications();
      final latest = RunnerVerification.latestByType(list);
      // Row 209: the ID never uses "newest record wins".
      expect(latest.containsKey(RunnerVerificationType.governmentId), isFalse);
      expect(list.first.status, VerificationStatus.rejected);
      expect(latest[RunnerVerificationType.selfie]!.id, 'v3');
      expect(latest.containsKey(RunnerVerificationType.phone), isFalse);

      final v = await repo.addVerification(
        RunnerVerificationType.paymentIdentity,
      );
      expect(v.status, VerificationStatus.pending);
      expect(a.bodies.last, {'verificationType': 'payment_identity'});
      // ID and selfie images go through the document upload (row 154).
      expect(
        () => repo.addVerification(RunnerVerificationType.selfie),
        throwsArgumentError,
      );
    });

    group('ensurePaymentIdentityVerification (S-1, row 218)', () {
      Map<String, Object?> pi(String id, String status, String at) => {
        'id': id,
        'verificationType': 'payment_identity',
        'status': status,
        'createdAt': at,
      };
      const created = {
        'id': 'new',
        'verificationType': 'payment_identity',
        'status': 'pending',
      };

      Future<(RunnerVerification, _Adapter)> run(List<Object?> list) async {
        final a = _Adapter({
          'GET /runners/me/verifications': (200, list),
          'POST /runners/me/verifications': (201, created),
        });
        final v = await RunnerAccountRepository(_client(a))
            .ensurePaymentIdentityVerification();
        return (v, a);
      }

      test('none yet: creates a pending record', () async {
        final (v, a) = await run([
          {
            'id': 's1',
            'verificationType': 'selfie',
            'status': 'pending',
            'createdAt': '2026-10-12T08:00:00.000Z',
          },
        ]);
        expect(v.id, 'new');
        expect(a.calls, [
          'GET /runners/me/verifications',
          'POST /runners/me/verifications',
        ]);
        expect(a.bodies.last, {'verificationType': 'payment_identity'});
      });

      for (final status in ['pending', 'approved']) {
        test('newest $status: skipped, returns it', () async {
          final (v, a) = await run([
            pi('p2', status, '2026-10-12T08:00:00.000Z'),
            pi('p1', 'rejected', '2026-10-10T08:00:00.000Z'),
          ]);
          expect(v.id, 'p2');
          expect(a.calls, ['GET /runners/me/verifications']);
        });
      }

      test('newest rejected: creates a new one', () async {
        final (v, a) = await run([
          pi('p1', 'approved', '2026-10-01T08:00:00.000Z'),
          pi('p2', 'rejected', '2026-10-12T08:00:00.000Z'),
        ]);
        expect(v.id, 'new');
        expect(a.calls.last, 'POST /runners/me/verifications');
      });
    });

    test('skills and areas use PUT', () async {
      final a = _Adapter({
        'PUT /runners/me/skills': (200, ['inspection', 'buy_for_me']),
        'PUT /runners/me/service-areas': (
          200,
          [
            {'id': 'nyali', 'name': 'Nyali'},
          ],
        ),
      });
      final repo = RunnerAccountRepository(_client(a));
      expect(
        await repo.setSkills([RunnerSkill.checkItForMe, RunnerSkill.buyForMe]),
        [RunnerSkill.buyForMe, RunnerSkill.checkItForMe],
      );
      expect(await repo.setServiceAreas(['nyali', 'nyali']), [
        const ServiceAreaOption(id: 'nyali', name: 'Nyali'),
      ]);
      expect(a.bodies.first, {
        'skills': ['inspection', 'buy_for_me'],
      });
      expect(a.bodies.last, {
        'areas': ['nyali'],
      });
    });
  });

  group('RunnerJobsRepository', () {
    test('activeJobs queries the runner active set', () async {
      final a = _Adapter({
        'GET /errands?status=RUNNER_ASSIGNED%2CRUNNER_EN_ROUTE%2CARRIVED%2CIN_PROGRESS%2CAWAITING_CUSTOMER%2CDISPUTED':
            (
              200,
              {
                'items': [_errand()],
                'nextCursor': null,
              },
            ),
      });
      final jobs = await RunnerJobsRepository(_client(a)).activeJobs();
      expect(jobs.single.id, 'e1');
    });

    test('runner transitions and the allowed map', () async {
      final a = _Adapter({
        'PATCH /errands/e1/status': (
          200,
          {
            'errand': _errand({'status': 'AWAITING_CUSTOMER'}),
            'history': {
              'id': 'h1',
              'errandId': 'e1',
              'fromStatus': 'IN_PROGRESS',
              'toStatus': 'AWAITING_CUSTOMER',
              'actorType': 'runner',
              'createdAt': '2026-10-13T07:00:00.000Z',
            },
          },
        ),
      });
      await RunnerJobsRepository(_client(a)).transition(
        'e1',
        from: ErrandStatus.inProgress,
        to: ErrandStatus.awaitingCustomer,
      );
      expect(a.bodies.single, {'to': 'AWAITING_CUSTOMER'});
      expect(
        RunnerJobsRepository.runnerTransitions[ErrandStatus.runnerEnRoute],
        {ErrandStatus.arrived, ErrandStatus.failed},
      );
      expect(
        () => RunnerJobsRepository(
          _client(a),
        ).transition('e1', from: ErrandStatus.arrived, to: ErrandStatus.failed),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('runner notes, evidence upload and price change', () async {
      final a = _Adapter({
        'PATCH /errands/e1/runner-notes': (
          200,
          _errand({'runnerNotes': 'All good'}),
        ),
        'POST /errands/e1/evidence': (
          201,
          {'id': 'ev1', 'errandId': 'e1', 'type': 'photo'},
        ),
        'POST /errands/e1/price-change': (
          201,
          {
            'id': 'p1',
            'errandId': 'e1',
            'requestedByUserId': 'u1',
            'fromPrice': '40000.00',
            'toPrice': '45000.00',
            'status': 'requested',
          },
        ),
      });
      final repo = RunnerJobsRepository(_client(a));
      final e = await repo.updateRunnerNotes('e1', 'All good');
      expect(e.runnerNotes, 'All good');
      expect(a.bodies[0], {'runnerNotes': 'All good'});

      final ev = await repo.uploadEvidence(
        'e1',
        type: EvidenceType.photo,
        bytes: Uint8List.fromList([1, 2, 3]),
        contentType: 'image/jpeg',
        capturedAt: DateTime.utc(2026, 10, 13, 7, 31),
        lat: -4.03,
        lon: 39.71,
      );
      expect(ev.id, 'ev1');
      expect(a.bodies[1], {
        'type': 'photo',
        'data': 'AQID',
        'contentType': 'image/jpeg',
        'capturedAt': '2026-10-13T07:31:00.000Z',
        'lat': -4.03,
        'lon': 39.71,
      });

      final p = await repo.requestPriceChange(
        'e1',
        toPrice: 45000,
        reason: 'Newer model only',
      );
      expect(p.isPending, isTrue);
      expect(a.bodies[2], {'toPrice': 45000, 'reason': 'Newer model only'});
    });
  });
}
