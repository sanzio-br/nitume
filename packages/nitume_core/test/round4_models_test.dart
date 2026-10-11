import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

Map<String, dynamic> _errand([Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'customerId': 'c1',
  'category': 'buy_for_me',
  'description': 'Buy a gas refill',
  'status': 'QUOTED',
  'urgency': 'standard',
  'budget': '3000.00',
  ...?extra,
};

void main() {
  group('Errand (round 4)', () {
    test('parses quoteRequestedAt and merchantDetailsUpdatedAt', () {
      final e = Errand.fromJson(
        _errand({
          'quoteRequestedAt': '2026-10-09T13:45:00.000Z',
          'merchantDetailsUpdatedAt': '2026-10-09T14:00:00.000Z',
        }),
      );
      expect(e.quoteRequestedAt, DateTime.utc(2026, 10, 9, 13, 45));
      expect(e.quoteRequestPending, isTrue);
      expect(e.merchantDetailsUpdatedAt, DateTime.utc(2026, 10, 9, 14));
    });

    test('both are null when absent, null or malformed', () {
      for (final e in [
        Errand.fromJson(_errand()),
        Errand.fromJson(
          _errand({'quoteRequestedAt': null, 'merchantDetailsUpdatedAt': 5}),
        ),
      ]) {
        expect(e.quoteRequestedAt, isNull);
        expect(e.quoteRequestPending, isFalse);
        expect(e.merchantDetailsUpdatedAt, isNull);
      }
    });
  });

  group('MerchantPayment (round 4)', () {
    test('merchant_direct carries the details-changed fields', () {
      final m = MerchantPayment.tryParse({
        'route': 'merchant_direct',
        'amount': '2800.00',
        'paidTo': 'merchant',
        'merchantName': 'Naivas',
        'tillNumber': '123456',
        'paybillNumber': null,
        'accountReference': null,
        'merchantDetailsUpdatedAt': '2026-10-09T13:45:00.000Z',
        'merchantDetailsChangedAfterPayment': true,
      })!;
      expect(m.merchantDetailsUpdatedAt, DateTime.utc(2026, 10, 9, 13, 45));
      expect(m.merchantDetailsChangedAfterPayment, isTrue);
    });

    test('send_to_runner and older responses default to unchanged', () {
      final m = MerchantPayment.tryParse({
        'route': 'send_to_runner',
        'amount': '2800.00',
        'paidTo': 'nitume',
      })!;
      expect(m.merchantDetailsUpdatedAt, isNull);
      expect(m.merchantDetailsChangedAfterPayment, isFalse);
    });

    test('only a real true flags a change', () {
      final m = MerchantPayment.tryParse({
        'route': 'merchant_direct',
        'amount': '1.00',
        'merchantDetailsChangedAfterPayment': 'true',
      })!;
      expect(m.merchantDetailsChangedAfterPayment, isFalse);
    });
  });

  group('CustomerRefund (round 4)', () {
    test('parses remainingRefundable', () {
      final r = CustomerRefund.tryParse({
        'status': 'approved',
        'amountPaid': '3000.00',
        'refundAmount': '1000.00',
        'remainingRefundable': '2000.00',
        'payoutReference': 'QAB12CD34E',
      })!;
      expect(r.remainingRefundable, '2000.00');
    });

    test('numbers become decimal strings; absent is null', () {
      expect(
        CustomerRefund.tryParse({
          'status': 'refunded',
          'remainingRefundable': 0,
        })!.remainingRefundable,
        '0.00',
      );
      expect(
        CustomerRefund.tryParse({'status': 'pending_review'})!
            .remainingRefundable,
        isNull,
      );
    });
  });

  group('Dispute (round 4)', () {
    Map<String, dynamic> dispute([Map<String, dynamic>? extra]) => {
      'id': 'd1',
      'errandId': 'e1',
      'openedBy': 'u1',
      'reason': 'Wrong item delivered',
      'status': 'resolved',
      ...?extra,
    };

    test('parses verdict, resolvedAt and resolution; resolvedBy null', () {
      final d = Dispute.fromJson(
        dispute({
          'resolution': 'Refund approved for the wrong item.',
          'resolvedBy': null,
          'verdict': 'customer_favourable',
          'resolvedAt': '2026-10-09T10:00:00.000Z',
        }),
      );
      expect(d.verdict, DisputeVerdict.customerFavourable);
      expect(d.resolvedAt, DateTime.utc(2026, 10, 9, 10));
      expect(d.resolution, 'Refund approved for the wrong item.');
      expect(d.resolvedBy, isNull);
    });

    test('open or unknown verdict parses as null', () {
      expect(Dispute.fromJson(dispute()).verdict, isNull);
      expect(Dispute.fromJson(dispute({'verdict': 'split'})).verdict, isNull);
      expect(
        Dispute.fromJson(dispute({'verdict': 'runner_favourable'})).verdict,
        DisputeVerdict.runnerFavourable,
      );
    });
  });

  test('round-4 notification event types', () {
    expect(
      NotificationEventType.tryFromWire('merchant_details.changed'),
      NotificationEventType.merchantDetailsChanged,
    );
    expect(
      NotificationEventType.tryFromWire('quote.requested'),
      NotificationEventType.quoteRequested,
    );
    expect(NotificationEventType.merchantDetailsChanged.status, isNull);
    expect(NotificationEventType.quoteRequested.status, isNull);
  });

  test('round-4 API error codes', () {
    expect(ApiErrorCodes.quoteRequestPending, 'quote_request_pending');
    expect(ApiErrorCodes.quoteRequestNotAllowed, 'quote_request_not_allowed');
    expect(ApiErrorCodes.quoteStillValid, 'quote_still_valid');
    expect(ApiErrorCodes.quoteExpiryInPast, 'quote_expiry_in_past');
    expect(
      ApiErrorCodes.merchantDetailsNotApplicable,
      'merchant_details_not_applicable',
    );
    expect(
      ApiErrorCodes.merchantAmountNotApplicable,
      'merchant_amount_not_applicable',
    );
    expect(ApiErrorCodes.refundPayoutLocked, 'refund_payout_locked');
  });
}
