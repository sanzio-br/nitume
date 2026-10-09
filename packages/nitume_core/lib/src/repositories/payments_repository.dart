import 'dart:math';

import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/payment.dart';

/// M-Pesa payments for an errand (`/payments`).
class PaymentsRepository {
  PaymentsRepository(this._api);

  final NitumeApiClient _api;

  /// Valid `Idempotency-Key`: 8–128 of `[A-Za-z0-9_-]`.
  static final idempotencyKeyPattern = RegExp(r'^[A-Za-z0-9_-]{8,128}$');

  static const _keyAlphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  /// A fresh random idempotency key (32 chars). Create one per checkout
  /// attempt and reuse it for every retry of that attempt (TIMEOUT, network
  /// error); make a new one only after `idempotency_key_reused`.
  static String newIdempotencyKey([Random? random]) {
    final r = random ?? Random.secure();
    return String.fromCharCodes(
      List.generate(
        32,
        (_) => _keyAlphabet.codeUnitAt(r.nextInt(_keyAlphabet.length)),
      ),
    );
  }

  /// Sends the STK push for the service + runner fee
  /// (`POST /payments/:errandId/initiate`) safely:
  ///
  /// * [idempotencyKey] goes in the `Idempotency-Key` header; a retry with
  ///   the same key returns the stored payment instead of charging twice.
  /// * [merchantRoute] is required when the errand has a merchant / item
  ///   amount (`merchant_route_required`); `merchantDirect` needs the
  ///   merchant's details (`merchant_details_missing`).
  /// * [paymentMethodId] picks a saved M-Pesa method; without it the API
  ///   uses the default method, then the login phone.
  ///
  /// Failures carry `NitumeApiException.code` (see `ApiErrorCodes`).
  Future<PaymentInitiation> initiateWith(
    String errandId, {
    required String idempotencyKey,
    MerchantRoute? merchantRoute,
    String? paymentMethodId,
  }) async {
    _checkKey(idempotencyKey);
    return PaymentInitiation.fromJson(
      await _api.postMap(
        '/payments/$errandId/initiate',
        headers: {'Idempotency-Key': idempotencyKey},
        data: {
          if (merchantRoute != null) 'merchantRoute': merchantRoute.wire,
          'paymentMethodId': ?paymentMethodId,
        },
      ),
    );
  }

  /// Sends the STK push without an idempotency key or route. Prefer
  /// [initiateWith]; this fails with `merchant_route_required` when the
  /// errand has an item amount.
  Future<PaymentInitiation> initiate(String errandId) async =>
      PaymentInitiation.fromJson(
        await _api.postMap('/payments/$errandId/initiate'),
      );

  /// Pushes the STK for a `send_to_runner` price-change difference again
  /// after it FAILED (`POST /payments/:errandId/price-changes/:requestId/
  /// initiate`). A pending, timed-out or paid difference comes back as is
  /// (no second push). 409 `difference_not_stk` for `merchant_direct`.
  Future<ItemPayment> retryDifferencePayment(
    String errandId,
    String requestId,
  ) async => ItemPayment.fromJson(
    await _api.postMap('/payments/$errandId/price-changes/$requestId/initiate'),
  );

  /// Main payment, legs, server `stkStatus` and merchant payment
  /// instructions (`GET /payments/:errandId`). Map the screen state with
  /// `StkPaymentState.fromSummary`.
  Future<PaymentSummary> forErrand(String errandId) async =>
      PaymentSummary.fromJson(await _api.getMap('/payments/$errandId'));

  static void _checkKey(String idempotencyKey) {
    if (!idempotencyKeyPattern.hasMatch(idempotencyKey)) {
      throw ArgumentError.value(
        idempotencyKey,
        'idempotencyKey',
        'must be 8-128 characters of A-Z, a-z, 0-9, - or _',
      );
    }
  }
}
