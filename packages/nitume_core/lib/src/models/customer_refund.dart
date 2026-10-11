import 'enums.dart';
import 'json_utils.dart';

/// The customer's view of a refund review on their task (`_shared.md` §11,
/// rows 37, 48, 54, 71): `GET /errands/:id/refund` (one) or
/// `GET /errands/:id/refunds` (all, newest first).
///
/// Status and amounts only. The admin decision note (SQ-10) is never
/// parsed and the customer view carries no payout reference, so no screen
/// can show either.
class CustomerRefund {
  const CustomerRefund({
    required this.status,
    this.id,
    this.errandId,
    this.amountPaid,
    this.refundAmount,
    this.remainingRefundable,
    this.trigger,
    this.priceChangeRequestId,
    this.createdAt,
    this.decidedAt,
    this.paidAt,
  });

  final RefundStatus status;
  final String? id;
  final String? errandId;

  /// Everything the customer paid for the task, as a decimal string.
  final String? amountPaid;

  /// Decided refund amount (decimal string); `null` until an admin decides.
  /// Shown only for [RefundStatus.approved] and [RefundStatus.refunded].
  final String? refundAmount;

  /// What can still be refunded on the whole task (row 87): everything paid
  /// to Nitume minus every approved or refunded review's amount, as a
  /// decimal string; `null` from older responses.
  final String? remainingRefundable;

  /// What opened the review; `null` when absent or unknown.
  final RefundTrigger? trigger;

  /// The approved price-change request of a
  /// [RefundTrigger.priceChangeDecrease] review; `null` otherwise.
  final String? priceChangeRequestId;
  final DateTime? createdAt;
  final DateTime? decidedAt;

  /// When the payout was recorded (`Sent <date, time>` for `refunded`).
  final DateTime? paidAt;

  /// True when the screen shows the `Refund amount` row (§11).
  bool get showsAmount =>
      refundAmount != null &&
      (status == RefundStatus.approved || status == RefundStatus.refunded);

  /// Parses a refund view; `null` when absent or its status is unknown (the
  /// refund group stays hidden).
  static CustomerRefund? tryParse(Object? json) {
    if (json is! Map) return null;
    final status = RefundStatus.tryFromWire(json['status']);
    if (status == null) return null;
    return CustomerRefund(
      status: status,
      id: parseOptionalString(json['id']),
      errandId: parseOptionalString(json['errandId']),
      amountPaid: parseDecimal(json['amountPaid']),
      refundAmount: parseDecimal(json['refundAmount']),
      remainingRefundable: parseDecimal(json['remainingRefundable']),
      trigger: RefundTrigger.tryFromWire(json['trigger']),
      priceChangeRequestId: parseOptionalString(json['priceChangeRequestId']),
      createdAt: parseDate(json['createdAt']),
      decidedAt: parseDate(json['decidedAt']),
      paidAt: parseDate(json['paidAt']),
    );
  }
}
