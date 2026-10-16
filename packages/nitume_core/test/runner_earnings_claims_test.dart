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

RunnerPayoutRepository _repo(_Adapter a) => RunnerPayoutRepository(
  NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: InMemoryTokenStore(),
    httpClientAdapter: a,
  ),
  keys: PaymentAttemptKeys(InMemoryIdempotencyKeyStore()),
);

Map<String, Object?> _totals(String a, String h, String p) => {
  'availableAmount': a,
  'onHoldAmount': h,
  'paidAmount': p,
};

final _earnings = <String, Object?>{
  'currency': 'KES',
  'availableAmount': '3200.00',
  'pendingAmount': '1200.00',
  'onHoldAmount': '450.00',
  'paidAmount': '6000.00',
  'byKind': {
    'runnerFee': _totals('2000.00', '0.00', '4000.00'),
    'itemReimbursement': _totals('1200.00', '450.00', '2000.00'),
  },
  'week': [
    for (var d = 12; d <= 18; d++)
      {'day': '2026-10-$d', 'runnerFeeAmount': d == 16 ? '750.00' : '0.00'},
  ],
  'weekTotal': '750.00',
  'period': {
    'from': '2026-10-10',
    'to': '2026-10-16',
    'groupBy': 'day',
    'timeZone': 'Africa/Nairobi',
    'totals': {
      'runnerFeeAmount': '750.00',
      'itemReimbursementAmount': '1200.00',
      'paidOutAmount': '0.00',
    },
    'buckets': [
      {
        'start': '2026-10-16',
        'runnerFeeAmount': '750.00',
        'itemReimbursementAmount': '1200.00',
        'paidOutAmount': '0.00',
      },
    ],
  },
};

NitumeApiException _err(int status, String code, [Map<String, Object?>? x]) =>
    NitumeApiException.fromDio(
      DioException(
        requestOptions: RequestOptions(path: '/x'),
        response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: status,
          data: {'statusCode': status, 'code': code, 'message': 'm', ...?x},
        ),
        type: DioExceptionType.badResponse,
      ),
    );

void main() {
  group('EarningsSummary', () {
    test('parses balances, kinds, week and period', () {
      final e = EarningsSummary.fromJson(_earnings);
      expect(e.availableAmount, '3200.00');
      expect(e.pendingAmount, '1200.00');
      expect(e.onHoldAmount, '450.00');
      expect(e.paidAmount, '6000.00');
      expect(e.runnerFee.paidAmount, '4000.00');
      expect(e.itemReimbursement.onHoldAmount, '450.00');
      expect(e.week, hasLength(7));
      expect(e.week[4].day, '2026-10-16');
      expect(e.week[4].runnerFeeAmount, '750.00');
      expect(e.weekTotal, '750.00');
      expect(e.period.from, '2026-10-10');
      expect(e.period.groupBy, EarningsGroupBy.day);
      expect(e.period.totals.start, isNull);
      expect(e.period.totals.itemReimbursementAmount, '1200.00');
      expect(e.period.buckets.single.start, '2026-10-16');
    });

    test('tolerates missing parts and numbers', () {
      final e = EarningsSummary.fromJson({
        'availableAmount': 10,
        'period': {'groupBy': 'quarter'},
      });
      expect(e.availableAmount, '10.00');
      expect(e.pendingAmount, '0.00');
      expect(e.runnerFee.availableAmount, '0.00');
      expect(e.week, isEmpty);
      expect(e.period.groupBy, isNull);
      expect(e.period.buckets, isEmpty);
    });

    test('eatDay converts an instant to the EAT calendar day', () {
      expect(
        EarningsSummary.eatDay(DateTime.utc(2026, 10, 16, 20, 59)),
        '2026-10-16',
      );
      expect(
        EarningsSummary.eatDay(DateTime.utc(2026, 10, 16, 21)),
        '2026-10-17',
      );
    });

    test('EarningsGroupBy round-trips', () {
      for (final g in EarningsGroupBy.values) {
        expect(EarningsGroupBy.tryFromWire(g.wire), g);
      }
    });
  });

  group('RunnerPayoutRepository.earnings', () {
    test('default query', () async {
      final a = _Adapter({'GET /runners/me/earnings': (200, _earnings)});
      final e = await _repo(a).earnings();
      expect(e.availableAmount, '3200.00');
    });

    test('range and groupBy', () async {
      final a = _Adapter({
        'GET /runners/me/earnings?from=2026-09-01&to=2026-09-30&groupBy=week': (
          200,
          _earnings,
        ),
      });
      await _repo(a).earnings(
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: EarningsGroupBy.week,
      );
      expect(a.calls.single, contains('groupBy=week'));
    });

    test('bad day format is refused locally', () {
      final a = _Adapter({});
      expect(() => _repo(a).earnings(from: '1/9/2026'), throwsArgumentError);
      expect(a.calls, isEmpty);
    });

    test('earnings_range_invalid surfaces', () async {
      final a = _Adapter({
        'GET /runners/me/earnings?from=2026-10-20&to=2026-10-01': (
          400,
          {
            'statusCode': 400,
            'code': 'earnings_range_invalid',
            'message': 'bad',
            'from': '2026-10-20',
            'to': '2026-10-01',
          },
        ),
      });
      await expectLater(
        _repo(a).earnings(from: '2026-10-20', to: '2026-10-01'),
        throwsA(
          isA<NitumeApiException>().having(
            (e) => e.code,
            'code',
            ApiErrorCodes.earningsRangeInvalid,
          ),
        ),
      );
    });
  });

  group('RunnerPayoutRepository.claimReimbursement', () {
    const line = {
      'id': 'l9',
      'kind': 'item_reimbursement',
      'status': 'on_hold',
      'amount': '1800.00',
      'errandId': 'e1',
      'errandTitle': 'Buy a gas refill',
      'errandReference': 'NT-1002',
      'reviewReason': 'out_of_pocket_claim',
      'createdAt': '2026-10-16T10:00:00.000Z',
      'payoutRequestId': null,
      'requestedAmount': null,
    };

    test('posts the claim and returns the on-hold line', () async {
      final a = _Adapter({
        'POST /runners/me/reimbursement-claims': (201, line),
      });
      final item = await _repo(a).claimReimbursement(
        errandId: 'e1',
        amount: 1800,
        receiptEvidenceId: 'ev1',
        note: '  Bought before the cancel  ',
      );
      expect(a.bodies.single, {
        'errandId': 'e1',
        'amount': 1800,
        'receiptEvidenceId': 'ev1',
        'note': 'Bought before the cancel',
      });
      expect(item.kind, PayoutFeedKind.itemReimbursement);
      expect(item.status, PayoutLineStatus.onHold);
      expect(item.reviewReason, PayoutReviewReason.outOfPocketClaim);
    });

    test('blank note is not sent', () async {
      final a = _Adapter({
        'POST /runners/me/reimbursement-claims': (201, line),
      });
      await _repo(a).claimReimbursement(
        errandId: 'e1',
        amount: 99.5,
        receiptEvidenceId: 'ev1',
        note: '   ',
      );
      expect(a.bodies.single, {
        'errandId': 'e1',
        'amount': 99.5,
        'receiptEvidenceId': 'ev1',
      });
    });

    test('local checks', () {
      final a = _Adapter({});
      final r = _repo(a);
      expect(
        () => r.claimReimbursement(
          errandId: 'e1',
          amount: 0,
          receiptEvidenceId: 'ev1',
        ),
        throwsArgumentError,
      );
      expect(
        () => r.claimReimbursement(
          errandId: 'e1',
          amount: 10,
          receiptEvidenceId: 'ev1',
          note: 'x' * 501,
        ),
        throwsArgumentError,
      );
      expect(a.calls, isEmpty);
    });

    test('reimbursement_exceeds_cap details', () async {
      final a = _Adapter({
        'POST /runners/me/reimbursement-claims': (
          400,
          {
            'statusCode': 400,
            'code': 'reimbursement_exceeds_cap',
            'message': 'too much',
            'cap': '3000.00',
            'itemPaidToNitume': '4500.00',
            'maxPurchaseAdvance': '3000.00',
          },
        ),
      });
      try {
        await _repo(a).claimReimbursement(
          errandId: 'e1',
          amount: 4000,
          receiptEvidenceId: 'ev1',
        );
        fail('expected an error');
      } on NitumeApiException catch (e) {
        expect(e.code, ApiErrorCodes.reimbursementExceedsCap);
        expect(e.decimalDetail('cap'), '3000.00');
        expect(e.decimalDetail('itemPaidToNitume'), '4500.00');
        expect(e.decimalDetail('maxPurchaseAdvance'), '3000.00');
      }
    });

    test('other claim codes', () {
      expect(
        _err(409, 'reimbursement_claim_not_allowed', {
          'status': 'COMPLETED',
        }).code,
        ApiErrorCodes.reimbursementClaimNotAllowed,
      );
      expect(
        _err(409, 'no_item_amount_paid').code,
        ApiErrorCodes.noItemAmountPaid,
      );
      final dup = _err(409, 'reimbursement_already_recorded', {'lineId': 'l1'});
      expect(dup.code, ApiErrorCodes.reimbursementAlreadyRecorded);
      expect(dup.details['lineId'], 'l1');
      expect(_err(400, 'receipt_required').code, ApiErrorCodes.receiptRequired);
    });
  });
}
