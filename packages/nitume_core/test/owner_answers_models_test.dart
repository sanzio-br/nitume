import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.routes);

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

NitumeApiClient _client(_Adapter adapter) => NitumeApiClient(
  config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
  tokenStore: InMemoryTokenStore(),
  httpClientAdapter: adapter,
);

Map<String, dynamic> _payment({
  String flow = 'customer_to_runner',
  String status = 'pending',
  String merchantAmount = '300.00',
}) => {
  'id': 'p2',
  'errandId': 'e1',
  'serviceFee': '0.00',
  'runnerFee': '0.00',
  'merchantAmount': merchantAmount,
  'paymentFlow': flow,
  'status': status,
};

Map<String, dynamic> _errand([Map<String, dynamic> extra = const {}]) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'buy_for_me',
  'description': 'Groceries',
  'status': 'QUOTED',
  'urgency': 'standard',
  'budget': '2000.00',
  ...extra,
};

void main() {
  group('RunnerSummary.shortName (row 40)', () {
    test('reads the API short name as returned', () {
      final r = RunnerSummary.fromJson({
        'id': 'r1',
        'verificationLevel': '2_id_verified',
        'avgRating': '4.90',
        'errandsCompleted': 3,
        'displayName': 'Kevin Otieno',
        'shortName': 'Kevin O.',
      });
      expect(r.shortName, 'Kevin O.');
      expect(r.displayName, 'Kevin Otieno');
    });

    test('is null when absent or blank; profiles carry it too', () {
      final p = RunnerPublicProfile.fromJson({
        'id': 'r1',
        'verificationLevel': '2_id_verified',
        'avgRating': '4.90',
        'errandsCompleted': 3,
        'shortName': ' ',
        'availability': 'online',
      });
      expect(p.shortName, isNull);
      final q = RunnerPublicProfile.fromJson({
        'id': 'r1',
        'verificationLevel': '2_id_verified',
        'avgRating': '4.90',
        'errandsCompleted': 3,
        'shortName': 'Amina W.',
        'availability': 'online',
      });
      expect(q.shortName, 'Amina W.');
    });
  });

  group('Errand.merchantDetailsAvailable (row 43)', () {
    test('uses the API flag when present', () {
      expect(
        Errand.fromJson(_errand({'merchantDetailsAvailable': true}))
            .merchantDetailsAvailable,
        isTrue,
      );
      expect(
        Errand.fromJson(_errand({'merchantDetailsAvailable': false}))
            .merchantDetailsAvailable,
        isFalse,
      );
    });

    test('reads feeTotal', () {
      expect(
        Errand.fromJson(_errand({'feeTotal': '450.00'})).feeTotal,
        '450.00',
      );
      expect(Errand.fromJson(_errand()).feeTotal, isNull);
    });

    test('falls back to the Till/Paybill fields, else null', () {
      expect(
        Errand.fromJson(
          _errand({
            'merchantTillNumber': '123456',
            'merchantPaybillNumber': null,
          }),
        ).merchantDetailsAvailable,
        isTrue,
      );
      expect(
        Errand.fromJson(
          _errand({'merchantTillNumber': null, 'merchantPaybillNumber': null}),
        ).merchantDetailsAvailable,
        isFalse,
      );
      expect(Errand.fromJson(_errand()).merchantDetailsAvailable, isNull);
    });
  });

  group('CustomerRefund (§11)', () {
    test('parses status, amounts and dates; never the payout reference', () {
      final r = CustomerRefund.tryParse({
        'id': 'rr1',
        'errandId': 'e1',
        'status': 'refunded',
        'amountPaid': '2500.00',
        'refundAmount': '2200.00',
        'payoutReference': 'QAB123',
        'trigger': 'price_change_rejected',
        'paidAt': '2026-10-08T10:03:00.000Z',
      })!;
      expect(r.status, RefundStatus.refunded);
      expect(r.refundAmount, '2200.00');
      expect(r.trigger, RefundTrigger.priceChangeRejected);
      expect(r.paidAt, DateTime.utc(2026, 10, 8, 10, 3));
      expect(r.showsAmount, isTrue);
    });

    test('unknown status hides the group; pending shows no amount', () {
      expect(CustomerRefund.tryParse({'status': 'weird'}), isNull);
      expect(CustomerRefund.tryParse(null), isNull);
      final p = CustomerRefund.tryParse({
        'status': 'pending_review',
        'refundAmount': null,
        'trigger': 'something_new',
      })!;
      expect(p.showsAmount, isFalse);
      expect(p.trigger, isNull);
    });

    test('ErrandRepository.refund maps 404 to null', () async {
      final adapter = _Adapter({
        'GET /errands/e1/refund': (
          200,
          {'status': 'approved', 'refundAmount': 500},
        ),
        'GET /errands/e2/refund': (
          404,
          {
            'statusCode': 404,
            'code': 'refund_not_found',
            'message': 'No refund for this task',
          },
        ),
      });
      final repo = ErrandRepository(_client(adapter));
      final r = await repo.refund('e1');
      expect(r!.status, RefundStatus.approved);
      expect(r.refundAmount, '500.00');
      expect(await repo.refund('e2'), isNull);
    });
  });

  group('item and difference payments (rows 42, 44, 48)', () {
    test('PaymentSummary reads differencePayments with stkStatus', () {
      final s = PaymentSummary.fromJson({
        'payment': null,
        'transactions': [],
        'stkStatus': null,
        'merchantPayment': null,
        'differencePayments': [
          {
            'payment': _payment(),
            'transactions': [],
            'stkStatus': 'TIMEOUT',
            'checkoutRequestId': null,
            'merchantPayment': {
              'route': 'send_to_runner',
              'amount': '300.00',
              'paidTo': 'nitume',
            },
          },
          {'payment': 'broken'},
        ],
      });
      expect(s.differencePayments, hasLength(1));
      final d = s.differencePayments.single;
      expect(d.stkStatus, StkPaymentState.timeout);
      expect(d.amount, '300.00');
      expect(d.merchantPayment!.paidToNitume, isTrue);
    });

    test('merchantPayment.paidTo decides who is paid', () {
      final direct = MerchantPayment.tryParse({
        'route': 'merchant_direct',
        'amount': '300.00',
        'paidTo': 'merchant',
        'tillNumber': '123456',
      })!;
      expect(direct.paidToNitume, isFalse);
      expect(direct.hasMerchantDetails, isTrue);
      final viaNitume = MerchantPayment.tryParse({
        'route': 'send_to_runner',
        'amount': '300.00',
        'paidTo': 'nitume',
      })!;
      expect(viaNitume.paidToNitume, isTrue);
      expect(viaNitume.paidTo, 'nitume');
    });

    test('PaymentSummary reads failureReason and merchantDetailsAvailable', () {
      final s = PaymentSummary.fromJson({
        'payment': _payment(status: 'failed'),
        'transactions': [],
        'stkStatus': 'FAILED',
        'failureReason': 'Request cancelled by user',
        'merchantDetailsAvailable': false,
      });
      expect(s.failureReason, 'Request cancelled by user');
      expect(s.merchantDetailsAvailable, isFalse);
      expect(s.differencePayments, isEmpty);
    });

    test(
      'PriceChangeDecision carries the difference STK and a refund review',
      () {
        final d = PriceChangeDecision.fromJson({
          'id': 'pc1',
          'errandId': 'e1',
          'requestedByUserId': 'u1',
          'fromPrice': '1000.00',
          'toPrice': '1300.00',
          'reason': 'Price went up',
          'status': 'approved',
          'differencePayment': {
            'payment': _payment(),
            'stkStatus': 'PENDING',
            'checkoutRequestId': 'ws_CO_1',
          },
          'refundReview': {'status': 'pending_review'},
        });
        expect(d.differencePayment!.stkStatus, StkPaymentState.pending);
        expect(d.differencePayment!.checkoutRequestId, 'ws_CO_1');
        expect(d.refundReview!.status, RefundStatus.pendingReview);
      },
    );

    test('retryDifferencePayment posts to the API', () async {
      final adapter = _Adapter({
        'POST /payments/e1/price-changes/pc1/initiate': (
          201,
          {
            'payment': _payment(),
            'transactions': [],
            'stkStatus': 'PENDING',
            'failureReason': null,
            'checkoutRequestId': 'ws_CO_2',
            'merchantPayment': {'route': 'send_to_runner', 'amount': '300.00'},
          },
        ),
      });
      final retry = await PaymentsRepository(_client(adapter))
          .retryDifferencePayment('e1', 'pc1');
      expect(retry.checkoutRequestId, 'ws_CO_2');
      expect(retry.stkStatus, StkPaymentState.pending);
    });
  });

  group('final contract extras', () {
    test('evidence signed url expiry (row 25)', () {
      final e = Evidence.fromJson({
        'id': 'ev1',
        'errandId': 'e1',
        'type': 'photo',
        'url': 'https://s3.test/x?sig=1',
        'urlExpiresAt': '2026-10-08T10:15:00.000Z',
      });
      expect(e.isUrlExpired(DateTime.utc(2026, 10, 8, 10, 14)), isFalse);
      expect(e.isUrlExpired(DateTime.utc(2026, 10, 8, 10, 15)), isTrue);
      final none = Evidence.fromJson({
        'id': 'ev2',
        'errandId': 'e1',
        'type': 'photo',
        'url': null,
      });
      expect(none.url, isNull);
      expect(none.isUrlExpired(), isFalse);
    });

    test('notification types include price change and refunds', () {
      expect(
        NotificationEventType.tryFromWire('price_change.requested'),
        NotificationEventType.priceChangeRequested,
      );
      expect(
        NotificationEventType.tryFromWire('refund.refunded'),
        NotificationEventType.refundRefunded,
      );
      expect(NotificationEventType.refundApproved.status, isNull);
      expect(NotificationEventType.quoted.status, ErrandStatus.quoted);
    });

    test('quote_expired carries expiresAt; OTP IP limit is classified', () {
      const e = NitumeApiException(
        message: 'Quote expired',
        statusCode: 409,
        code: 'quote_expired',
        details: {'quoteId': 'q1', 'expiresAt': '2026-10-08T09:00:00.000Z'},
      );
      expect(e.code, ApiErrorCodes.quoteExpired);
      expect(e.quoteExpiresAt, DateTime.utc(2026, 10, 8, 9));
      expect(
        OtpErrorKind.fromApiException(
          const NitumeApiException(
            message: 'Too many',
            statusCode: 429,
            code: 'otp_ip_rate_limited',
          ),
        ),
        OtpErrorKind.ipRateLimited,
      );
      expect(ApiErrorCodes.budgetRequired, 'budget_required');
      expect(ApiErrorCodes.budgetNotApplicable, 'budget_not_applicable');
    });
  });
}
