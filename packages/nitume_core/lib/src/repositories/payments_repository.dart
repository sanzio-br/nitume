import '../api/nitume_api_client.dart';
import '../models/enums.dart';
import '../models/payment.dart';

/// M-Pesa payments for an errand (`/payments`).
class PaymentsRepository {
  PaymentsRepository(this._api);

  final NitumeApiClient _api;

  /// Sends the STK push (`POST /payments/:errandId/initiate`). The API picks
  /// the payment flow itself today. Confirmation arrives via the errand
  /// moving to PAYMENT_CONFIRMED (realtime status event or polling
  /// [forErrand]).
  Future<PaymentInitiation> initiate(String errandId) async =>
      PaymentInitiation.fromJson(
        await _api.postMap('/payments/$errandId/initiate'),
      );

  /// Payment and its legs (`GET /payments/:errandId`).
  Future<PaymentSummary> forErrand(String errandId) async =>
      PaymentSummary.fromJson(await _api.getMap('/payments/$errandId'));

  /// TODO(A-6, A-7): customer-chosen merchant payment flow and an
  /// idempotency key on initiation. Neither exists on the API and both are
  /// owner decisions (payments, §3); do not send these fields until the
  /// contract is defined. Use [initiate] meanwhile.
  Future<PaymentInitiation> initiateWith(
    String errandId, {
    PaymentFlow? flow,
    String? idempotencyKey,
  }) {
    throw UnimplementedError(
      'A-6/A-7: payment-flow choice and idempotency key are not in the API',
    );
  }
}
