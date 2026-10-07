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
  /// Fallback for responses without a server `stkStatus`; prefer
  /// [fromSummary], which uses the server value when present.
  ///
  /// Retrying from [timeout] must not create a duplicate charge: retry with
  /// `PaymentsRepository.initiateWith` and the **same** idempotency key.
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

  /// State for a `GET /payments/:errandId` result: the server-computed
  /// `stkStatus` when present (authoritative, TIMEOUT after 120s), otherwise
  /// [from] on the payment status.
  static StkPaymentState fromSummary(
    PaymentSummary summary, {
    required Duration elapsed,
    required Duration confirmationWindow,
  }) =>
      summary.stkStatus ??
      from(
        status: summary.payment?.status,
        elapsed: elapsed,
        confirmationWindow: confirmationWindow,
      );
}
