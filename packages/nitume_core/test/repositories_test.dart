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
  group('NitumeApiException', () {
    test('keeps the API code and extra fields; coded 401 is not a session '
        'failure', () async {
      final adapter = _FakeAdapter({
        'POST /auth/otp/verify': (401, {
          'statusCode': 401,
          'code': 'otp_incorrect',
          'message': 'Incorrect verification code.',
          'attemptsRemaining': 3,
        }),
        'POST /auth/otp/request': (429, {
          'statusCode': 429,
          'code': 'otp_resend_cooldown',
          'message': 'Please wait 42s before requesting another code.',
          'secondsRemaining': 42,
          'retryAfterSeconds': 42,
        }),
      });
      final api = _client(adapter);
      try {
        await api.post('/auth/otp/verify', data: const {});
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, 'otp_incorrect');
        expect(e.message, 'Incorrect verification code.');
        expect(e.isUnauthorized, isFalse);
        expect(e.intDetail('attemptsRemaining'), 3);
        expect(OtpErrorKind.fromApiException(e), OtpErrorKind.incorrect);
      }
      try {
        await api.post('/auth/otp/request', data: const {});
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, 'otp_resend_cooldown');
        expect(e.retryAfter, const Duration(seconds: 42));
        expect(OtpErrorKind.fromApiException(e), OtpErrorKind.resendTooSoon);
      }
    });
  });

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

    test('initiateWith sends the Idempotency-Key, route and method',
        () async {
      final adapter = _FakeAdapter({
        'POST /payments/e1/initiate': (201, {
          'payment': {
            'id': 'p1',
            'errandId': 'e1',
            'serviceFee': '700.00',
            'runnerFee': '1500.00',
            'merchantAmount': '40000.00',
            'paymentFlow': 'merchant_direct',
            'status': 'pending',
          },
          'reference': 'MP123',
          'checkoutRequestId': 'ws_CO_1',
          'transactions': <Object>[],
          'stkStatus': 'PENDING',
          'merchantPayment': {
            'route': 'merchant_direct',
            'amount': '40000.00',
            'merchantName': null,
            'tillNumber': null,
            'paybillNumber': null,
            'accountReference': null,
          },
        }),
      });
      final key = PaymentsRepository.newIdempotencyKey();
      expect(PaymentsRepository.idempotencyKeyPattern.hasMatch(key), isTrue);
      final r = await PaymentsRepository(_client(adapter)).initiateWith(
        'e1',
        idempotencyKey: key,
        merchantRoute: MerchantRoute.merchantDirect,
        paymentMethodId: 'pm1',
      );
      final request = adapter.requests.single;
      expect(request.headers['Idempotency-Key'], key);
      expect(request.data, {
        'merchantRoute': 'merchant_direct',
        'paymentMethodId': 'pm1',
      });
      expect(r.stkStatus, StkPaymentState.pending);
      expect(r.merchantPayment?.route, MerchantRoute.merchantDirect);
      expect(r.merchantPayment?.amount, '40000.00');
      expect(r.merchantPayment?.hasMerchantDetails, isFalse);
    });

    test('initiateWith rejects a malformed key before calling the API',
        () async {
      final adapter = _FakeAdapter({});
      final repo = PaymentsRepository(_client(adapter));
      expect(
        () => repo.initiateWith('e1', idempotencyKey: 'short'),
        throwsArgumentError,
      );
      expect(
        () => repo.initiateWith('e1', idempotencyKey: 'has spaces in it'),
        throwsArgumentError,
      );
      expect(adapter.requests, isEmpty);
    });

    test('payment error codes reach the caller', () async {
      final adapter = _FakeAdapter({
        'POST /payments/e1/initiate': (400, {
          'statusCode': 400,
          'code': 'merchant_route_required',
          'message': 'Choose how the merchant amount is paid',
        }),
      });
      await expectLater(
        PaymentsRepository(_client(adapter))
            .initiateWith('e1', idempotencyKey: 'abcdefgh'),
        throwsA(
          isA<NitumeApiException>().having(
            (e) => e.code,
            'code',
            ApiErrorCodes.merchantRouteRequired,
          ),
        ),
      );
    });

    test('summary parses send-to-runner and Till details', () {
      final summary = PaymentSummary.fromJson({
        'payment': null,
        'transactions': <Object>[],
        'stkStatus': null,
        'merchantPayment': null,
      });
      expect(summary.stkStatus, isNull);
      expect(summary.merchantPayment, isNull);

      final till = MerchantPayment.tryParse({
        'route': 'merchant_direct',
        'amount': '45000.00',
        'merchantName': 'Sarit Shoes',
        'tillNumber': '123456',
        'paybillNumber': null,
        'accountReference': null,
      })!;
      expect(till.hasMerchantDetails, isTrue);
      expect(till.tillNumber, '123456');
      final runner = MerchantPayment.tryParse({
        'route': 'send_to_runner',
        'amount': '5000.00',
      })!;
      expect(runner.route, MerchantRoute.sendToRunner);
      expect(runner.hasMerchantDetails, isFalse);
      expect(MerchantPayment.tryParse({'route': 'runner_advance'}), isNull);
    });
  });

  group('StkPaymentState', () {
    const window = Duration(seconds: 90);

    test('maps provider answers to success / failed', () {
      expect(
        StkPaymentState.from(
          status: PaymentStatus.completed,
          elapsed: Duration.zero,
          confirmationWindow: window,
        ),
        StkPaymentState.success,
      );
      expect(
        StkPaymentState.from(
          status: PaymentStatus.failed,
          elapsed: Duration.zero,
          confirmationWindow: window,
        ),
        StkPaymentState.failed,
      );
    });

    test('unconfirmed past the window is timeout, never failed', () {
      for (final status in [
        null,
        PaymentStatus.pending,
        PaymentStatus.authorized,
      ]) {
        expect(
          StkPaymentState.from(
            status: status,
            elapsed: const Duration(seconds: 10),
            confirmationWindow: window,
          ),
          StkPaymentState.pending,
        );
        final late = StkPaymentState.from(
          status: status,
          elapsed: window,
          confirmationWindow: window,
        );
        expect(late, StkPaymentState.timeout);
        expect(late.keepChecking, isTrue);
        expect(late.isFinal, isFalse);
      }
    });

    test('fromSummary prefers the server stkStatus', () {
      expect(
        StkPaymentState.fromSummary(
          const PaymentSummary(stkStatus: StkPaymentState.timeout),
          elapsed: Duration.zero,
          confirmationWindow: window,
        ),
        StkPaymentState.timeout,
      );
      expect(parseStkStatus('SUCCESS'), StkPaymentState.success);
      expect(parseStkStatus('FAILED'), StkPaymentState.failed);
      expect(parseStkStatus('nope'), isNull);
    });

    test('fromSummary handles a missing payment row', () {
      expect(
        StkPaymentState.fromSummary(
          const PaymentSummary(),
          elapsed: const Duration(seconds: 120),
          confirmationWindow: window,
        ),
        StkPaymentState.timeout,
      );
      expect(StkPaymentState.success.isConfirmed, isTrue);
      expect(StkPaymentState.failed.keepChecking, isFalse);
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

    const request = {
      'id': 'pc1',
      'errandId': 'e1',
      'requestedByUserId': 'u2',
      'fromPrice': '40000.00',
      'toPrice': '45000.00',
      'status': 'approved',
    };

    test('approve sends the route and parses the difference payment',
        () async {
      final adapter = _FakeAdapter({
        'POST /errands/e1/price-change/pc1/approve': (201, {
          ...request,
          'differencePayment': {
            'payment': {
              'id': 'p2',
              'errandId': 'e1',
              'serviceFee': '0.00',
              'runnerFee': '0.00',
              'merchantAmount': '5000.00',
              'paymentFlow': 'customer_to_runner',
              'status': 'pending',
            },
            'merchantPayment': {'route': 'send_to_runner', 'amount': '5000.00'},
          },
        }),
      });
      final d = await PriceChangeRepository(_client(adapter)).approve(
        'e1',
        'pc1',
        merchantRoute: MerchantRoute.sendToRunner,
      );
      expect(adapter.requests.single.data, {'merchantRoute': 'send_to_runner'});
      expect(d.request.status, PriceChangeStatus.approved);
      expect(d.differencePayment?.payment.merchantAmount, '5000.00');
      expect(d.differencePayment?.merchantPayment?.route,
          MerchantRoute.sendToRunner);
    });

    test('reject parses a decision without a difference payment', () async {
      final adapter = _FakeAdapter({
        'POST /errands/e1/price-change/pc1/reject': (201, {
          ...request,
          'status': 'rejected',
          'differencePayment': null,
        }),
      });
      final d =
          await PriceChangeRepository(_client(adapter)).reject('e1', 'pc1');
      expect(d.request.status, PriceChangeStatus.rejected);
      expect(d.differencePayment, isNull);
    });
  });

  group('Profile and title updates', () {
    test('updateTitle patches the errand; updateDisplayName trims',
        () async {
      final adapter = _FakeAdapter({
        'PATCH /errands/e1': (200, {..._errand, 'title': 'Apartment check'}),
        'PATCH /users/me': (200, {
          'id': 'u1',
          'phone': '+254712345678',
          'role': 'customer',
          'status': 'active',
          'displayName': 'Amina Otieno',
        }),
      });
      final api = _client(adapter);
      final e = await ErrandRepository(api).updateTitle('e1', 'Apartment check');
      expect(adapter.requests.first.data, {'title': 'Apartment check'});
      expect(e.title, 'Apartment check');
      final u = await AuthRepository(api: api, tokenStore: InMemoryTokenStore())
          .updateDisplayName('  Amina Otieno ');
      expect(adapter.requests.last.data, {'displayName': 'Amina Otieno'});
      expect(u.displayName, 'Amina Otieno');
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
      expect(NotificationEventType.tryFromWire('errand.CONFIRMED'), isNull);
      expect(NotificationEventType.tryFromWire('errand.SETTLED'), isNull);
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

    test('forErrand returns null on 404', () async {
      final adapter = _FakeAdapter({
        'GET /errands/e1/dispute': (404, {
          'statusCode': 404,
          'message': 'No dispute for this task',
        }),
      });
      expect(await DisputesRepository(_client(adapter)).forErrand('e1'),
          isNull);
    });
  });

  group('CustomerAccountRepository payment methods', () {
    test('lists M-Pesa only and skips card/bank rows (Q10)', () async {
      final adapter = _FakeAdapter({
        'GET /customers/me/payment-methods': (200, [
          {
            'id': 'pm1',
            'type': 'mpesa',
            'label': 'M-Pesa',
            'detail': '+254 712 ••• 678',
            'isDefault': true,
          },
          {
            'id': 'pm2',
            'type': 'card',
            'label': 'Visa',
            'detail': '•••• 4242',
            'isDefault': false,
          },
        ]),
      });
      final methods =
          await CustomerAccountRepository(_client(adapter)).paymentMethods();
      expect(methods.map((m) => m.id), ['pm1']);
      expect(methods.single.type, PaymentMethodType.mpesa);
    });

    test('add always posts type mpesa', () async {
      final adapter = _FakeAdapter({
        'POST /customers/me/payment-methods': (201, {
          'id': 'pm1',
          'type': 'mpesa',
          'label': 'M-Pesa',
          'detail': '+254 712 ••• 678',
          'isDefault': false,
        }),
      });
      await CustomerAccountRepository(_client(adapter))
          .addPaymentMethod(label: 'M-Pesa', detail: '+254 712 ••• 678');
      expect((adapter.requests.single.data as Map)['type'], 'mpesa');
    });

    test('type enum has no card variant', () {
      expect(PaymentMethodType.values, [PaymentMethodType.mpesa]);
      expect(PaymentMethodType.tryFromWire('card'), isNull);
      expect(() => PaymentMethodType.fromWire('card'), throwsFormatException);
    });
  });

  group('Owner-approved errand fields', () {
    test('absent fields parse as null', () {
      final e = Errand.fromJson(Map<String, dynamic>.from(_errand));
      expect(e.reference, isNull);
      expect(e.title, isNull);
      expect(e.runnerNotes, isNull);
      expect(e.items, isNull);
      expect(e.locations, isNull);
      expect(e.pickup, isNull);
      expect(e.runner?.displayName, isNull);
      final u = AppUser.fromJson({
        'id': 'u1',
        'phone': '+254712345678',
        'role': 'customer',
        'status': 'active',
      });
      expect(u.displayName, isNull);
    });

    test('present fields parse; malformed entries are skipped', () {
      final e = Errand.fromJson({
        ..._errand,
        'reference': 'NT-10482',
        'title': 'Apartment check — Nyali',
        'runnerNotes': 'Caretaker says water is on Tuesdays.',
        'items': [
          {'id': 'i1', 'name': 'Milk', 'quantity': 2, 'notes': 'Brookside'},
          {'quantity': 3},
          'bad',
        ],
        'locations': [
          {
            'id': 'l1',
            'pointType': 'pickup',
            'lat': -1.29,
            'lng': 36.82,
            'addressText': 'Naivas Westlands',
          },
          {
            'pointType': 'dropoff',
            'lat': -1.3,
            'lng': 36.8,
            'addressText': 'Kilimani',
          },
          {'pointType': 'nowhere'},
        ],
        'assignment': {
          ...(_errand['assignment']! as Map<String, Object?>),
          'runner': {
            'id': 'r1',
            'verificationLevel': '2_id_verified',
            'avgRating': '4.90',
            'errandsCompleted': 137,
            'displayName': 'Brian K.',
          },
        },
      });
      expect(e.reference, 'NT-10482');
      expect(e.title, 'Apartment check — Nyali');
      expect(e.runnerNotes, 'Caretaker says water is on Tuesdays.');
      expect(e.items!.single.name, 'Milk');
      expect(e.items!.single.quantity, 2);
      expect(e.items!.single.notes, 'Brookside');
      expect(e.items!.single.id, 'i1');
      expect(e.pickup?.id, 'l1');
      expect(e.pickup?.lng, 36.82);
      expect(e.locations, hasLength(2));
      expect(e.pickup?.addressText, 'Naivas Westlands');
      expect(e.dropoff?.addressText, 'Kilimani');
      expect(e.taskSite, isNull);
      expect(e.runner?.displayName, 'Brian K.');
    });

    test('blank strings and non-list values are null', () {
      final e = Errand.fromJson({
        ..._errand,
        'reference': '  ',
        'items': 'Milk, bread',
        'locations': {'pointType': 'pickup'},
      });
      expect(e.reference, isNull);
      expect(e.items, isNull);
      expect(e.locations, isNull);
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
