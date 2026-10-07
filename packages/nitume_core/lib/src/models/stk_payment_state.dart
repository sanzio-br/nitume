import 'enums.dart';
import 'payment.dart';

/// What the M-Pesa STK payment screen shows (Q21, decided): `PENDING`,
/// `SUCCESS`, `FAILED` or `TIMEOUT`.
///
/// [timeout] means "not confirmed yet, still checking". It is **not** a
/// failure: only the provider (M-Pesa callback → `payments.status = failed`)
/// can fail a payment. While timed out the screen keeps checking and offers
/// "Check again".
enum StkPaymentState {
  /// Prompt sent, waiting for the provider, inside the confirmation window.
  pending,

  /// Provider confirmed the payment.
  success,

  /// Provider reported failure or cancellation. Safe to try again.
  failed,

  /// No provider answer within the confirmation window. Unconfirmed, not
  /// failed: keep checking.
  timeout;

  /// True only when the provider confirmed the payment.
  bool get isConfirmed => this == success;

  /// True while the outcome is unknown ([pending] or [timeout]): keep
  /// polling `GET /payments/:errandId` / listening for PAYMENT_CONFIRMED.
  bool get keepChecking => this == pending || this == timeout;

  /// True when the provider gave a final answer ([success] or [failed]).
  bool get isFinal => this == success || this == failed;

  /// Derives the screen state from the API payment status.
  ///
  /// [status] is `Payment.status` (`null` before a payment row exists).
  /// [elapsed] is the time since the STK push was sent; once it reaches
  /// [confirmationWindow] an unconfirmed payment becomes [timeout]. The
  /// window length is a screen/product setting (the spec recommends 90s,
  /// v-payment Q2); core does not pick it.
  ///
  /// `completed` → [success]; `failed` and `refunded` → [failed];
  /// `pending`, `authorized` and `null` → [pending] or [timeout].
  ///
  /// Retrying from [timeout] must not create a duplicate charge. Today the
  /// API answers a second initiate with `checkoutRequestId: PENDING` while a
  /// push is outstanding (`PaymentInitiation.alreadyPending`); the full
  /// idempotency key is still an open owner question (BOARD row 24).
  static StkPaymentState from({
    required PaymentStatus? status,
    required Duration elapsed,
    required Duration confirmationWindow,
  }) {
    switch (status) {
      case PaymentStatus.completed:
        return success;
      case PaymentStatus.failed:
      case PaymentStatus.refunded:
        return failed;
      case PaymentStatus.pending:
      case PaymentStatus.authorized:
      case null:
        return elapsed >= confirmationWindow ? timeout : pending;
    }
  }

  /// [from] applied to a `GET /payments/:errandId` result.
  static StkPaymentState fromSummary(
    PaymentSummary summary, {
    required Duration elapsed,
    required Duration confirmationWindow,
  }) =>
      from(
        status: summary.payment?.status,
        elapsed: elapsed,
        confirmationWindow: confirmationWindow,
      );
}
