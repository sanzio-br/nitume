import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// Records requests and answers from a route table.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.routes);

  final Map<String, (int, Object?)> routes;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final key = '${options.method} ${options.path}';
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

NitumeApiClient _client(_FakeAdapter adapter) => NitumeApiClient(
      config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
      tokenStore: InMemoryTokenStore(),
      httpClientAdapter: adapter,
    );

const _errand = {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'inspection',
  'description': 'Check the apartment in Nyali',
  'status': 'RUNNER_EN_ROUTE',
  'urgency': 'standard',
  'budget': '2200.00',
  'quotedPrice': '2200.00',
  'finalPrice': null,
  'createdAt': '2026-10-07T07:03:00.000Z',
  'assignment': {
    'id': 'a1',
    'status': 'assigned',
    'assignedAt': '2026-10-07T07:10:00.000Z',
    'runner': {
      'id': 'r1',
      'verificationLevel': '2_id_verified',
      'avgRating': '4.90',
      'errandsCompleted': 137,
    },
  },
};

void main() {
  group('ErrandRepository', () {
    test('list sends a comma-joined status filter and parses assignment',
        () async {
      final adapter = _FakeAdapter({
        'GET /errands': (200, {
          'items': [_errand],
          'nextCursor': 'abc',
        }),
      });
      final page = await ErrandRepository(_client(adapter)).list(
        statuses: {ErrandStatus.inProgress, ErrandStatus.arrived},
        limit: 2,
      );
      final q = adapter.requests.single.queryParameters;
      expect(q['status'], 'IN_PROGRESS,ARRIVED');
      expect(q['limit'], 2);
      expect(q.containsKey('cursor'), isFalse);
      expect(page.hasMore, isTrue);
      final e = page.items.single;
      expect(e.category, ErrandCategory.checkItForMe);
      expect(e.runner?.avgRating, '4.90');
      expect(e.runner?.verificationLevel, VerificationLevel.idVerified);
      expect(e.assignment?.status, AssignmentStatus.assigned);
    });

    test('quote returns null on 404', () async {
      final repo = ErrandRepository(_client(_FakeAdapter({})));
      expect(await repo.quote('e1'), isNull);
    });

    test('quote parses the breakdown as decimal strings', () async {
      final repo = ErrandRepository(_client(_FakeAdapter({
        'GET /errands/e1/quote': (200, {
          'id': 'q1',
          'errandId': 'e1',
          'baseFee': '700.00',
          'distanceFee': '0.00',
          'timeFee': '0.00',
          'urgencyFee': '0.00',
          'complexityFee': '0.00',
          'premiumFee': '0.00',
          'total': '2200.00',
          'currency': 'KES',
          'expiresAt': null,
          'createdAt': '2026-10-07T07:00:00.000Z',
        }),
      })));
      final q = await repo.quote('e1');
      expect(q!.total, '2200.00');
      expect(formatKes(q.total), 'KSh 2,200');
    });

    test('tracking snapshot parses points and runner location', () async {
      final repo = ErrandRepository(_client(_FakeAdapter({
        'GET /errands/e1/tracking': (200, {
          'errandId': 'e1',
          'status': 'RUNNER_EN_ROUTE',
          'live': true,
          'points': [
            {
              'pointType': 'task_site',
              'lat': -4.04,
              'lng': 39.7,
              'addressText': 'Nyali',
            },
          ],
          'runner': null,
          'runnerLocation': {
            'lat': -4.05,
            'lng': 39.69,
            'capturedAt': '2026-10-07T07:12:00.000Z',
          },
          'eta': null,
        }),
      })));
      final t = await repo.tracking('e1');
      expect(t.live, isTrue);
      expect(t.points.single.pointType, ErrandPointType.taskSite);
      expect(t.points.single.lng, 39.7);
      expect(t.runnerLocation?.point, const GeoPoint(lat: -4.05, lng: 39.69));
      expect(t.eta, isNull);
    });

    test('create posts the DTO with lat/lon and parses the result', () async {
      final adapter = _FakeAdapter({
        'POST /errands': (201, {
          'errand': {..._errand, 'status': 'DRAFT', 'assignment': null},
          'history': {
            'id': 'h1',
            'errandId': 'e1',
            'fromStatus': null,
            'toStatus': 'DRAFT',
            'actorType': 'customer',
            'actorId': 'u1',
            'note': null,
            'createdAt': '2026-10-07T07:00:00.000Z',
          },
        }),
      });
      final result = await ErrandRepository(_client(adapter)).create(
        const CreateErrandRequest(
          category: ErrandCategory.checkItForMe,
          description: 'Check the apartment in Nyali',
          budget: 2200,
          locations: [
            ErrandLocation(
              pointType: ErrandPointType.taskSite,
              lat: -4.04,
              lng: 39.7,
              addressText: 'Nyali, Mombasa',
            ),
          ],
        ),
      );
      final body = adapter.requests.single.data as Map;
      expect(body['category'], 'inspection');
      expect((body['locations'] as List).single['lon'], 39.7);
      expect(body.containsKey('items'), isFalse);
      expect(result.errand.status, ErrandStatus.draft);
      expect(result.history.actorType, StatusHistoryActor.customer);
    });
  });

  group('PaymentsRepository', () {
    test('initiate parses payment and transactions', () async {
      final repo = PaymentsRepository(_client(_FakeAdapter({
        'POST /payments/e1/initiate': (201, {
          'payment': {
            'id': 'p1',
            'errandId': 'e1',
            'serviceFee': '700.00',
            'runnerFee': '1500.00',
            'merchantAmount': '0.00',
            'paymentFlow': 'platform_only',
            'status': 'pending',
          },
          'reference': 'MP123',
          'checkoutRequestId': 'ws_CO_1',
          'transactions': [
            {
              'id': 't1',
              'paymentId': 'p1',
              'paymentTypeId': 'pt1',
              'mpesaReference': 'MP123',
              'amount': '700.00',
              'status': 'initiated',
            },
          ],
        }),
      })));
      final r = await repo.initiate('e1');
      expect(r.payment.paymentFlow, PaymentFlow.platformOnly);
      expect(r.transactions.single.status, PaymentTransactionStatus.initiated);
      expect(r.alreadyPaid, isFalse);
    });

    test('flow choice and idempotency stay TODO (A-6, A-7)', () {
      final repo = PaymentsRepository(_client(_FakeAdapter({})));
      expect(() => repo.initiateWith('e1'), throwsUnimplementedError);
    });
  });

  group('PriceChangeRepository', () {
    test('pending filters by status and returns the newest', () async {
      final adapter = _FakeAdapter({
        'GET /errands/e1/price-change': (200, [
          {
            'id': 'old',
            'errandId': 'e1',
            'requestedByUserId': 'u2',
            'fromPrice': '40000.00',
            'toPrice': '42000.00',
            'reason': null,
            'status': 'requested',
            'createdAt': '2026-10-07T07:00:00.000Z',
          },
          {
            'id': 'new',
            'errandId': 'e1',
            'requestedByUserId': 'u2',
            'fromPrice': '40000.00',
            'toPrice': '45000.00',
            'reason': 'Item priced higher',
            'status': 'requested',
            'createdAt': '2026-10-07T08:00:00.000Z',
          },
        ]),
      });
      final p = await PriceChangeRepository(_client(adapter)).pending('e1');
      expect(adapter.requests.single.queryParameters['status'], 'requested');
      expect(p?.id, 'new');
      expect(formatAmount(p!.toPrice), '45,000');
    });
  });

  group('NotificationsRepository', () {
    test('list parses items, unread and typed event', () async {
      final repo = NotificationsRepository(_client(_FakeAdapter({
        'GET /notifications': (200, {
          'items': [
            {
              'id': 'n1',
              'eventType': 'errand.RUNNER_EN_ROUTE',
              'title': 'Runner en route',
              'errandId': 'e1',
              'readAt': null,
            },
          ],
          'unread': 1,
        }),
      })));
      final page = await repo.list();
      expect(page.unread, 1);
      expect(page.items.single.event, NotificationEventType.runnerEnRoute);
      expect(page.items.single.event?.status, ErrandStatus.runnerEnRoute);
    });
  });

  group('DisputesRepository', () {
    test('open posts errandId and reason', () async {
      final adapter = _FakeAdapter({
        'POST /disputes': (201, {
          'id': 'd1',
          'errandId': 'e1',
          'openedBy': 'u1',
          'reason': 'Wrong item',
          'status': 'open',
          'resolution': null,
          'resolvedBy': null,
          'events': [
            {'id': 'ev1', 'eventType': 'opened', 'actorId': 'u1', 'payload': null},
          ],
        }),
      });
      final d = await DisputesRepository(_client(adapter))
          .open(errandId: 'e1', reason: 'Wrong item');
      expect(adapter.requests.single.data, {'errandId': 'e1', 'reason': 'Wrong item'});
      expect(d.status, DisputeStatus.open);
      expect(d.events.single.eventType, DisputeEventType.opened);
    });
  });

  group('Evidence and realtime payloads', () {
    test('evidence url may be null', () {
      final e = Evidence.fromJson({
        'id': 'ev1',
        'errandId': 'e1',
        'type': 'photo',
        's3Key': 'k',
        'url': null,
        'capturedAt': '2026-10-07T08:00:00.000Z',
        'capturedAtLocation': {
          'type': 'Point',
          'coordinates': [39.7, -4.04],
        },
      });
      expect(e.url, isNull);
      expect(e.capturedAtLocation, const GeoPoint(lat: -4.04, lng: 39.7));
    });

    test('location:update converts eta seconds', () {
      final u = LocationUpdate.fromJson({
        'errandId': 'e1',
        'lat': -4.05,
        'lng': 39.69,
        'eta': 720,
        'ts': '2026-10-07T08:00:00.000Z',
      });
      expect(formatEta(u.eta!), 'ETA 12 min');
      expect(RealtimeEvents.errandRoom('e1'), 'errand:e1');
    });
  });
}
