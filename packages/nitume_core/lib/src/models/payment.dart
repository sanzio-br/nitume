import 'enums.dart';
import 'json_utils.dart';
import 'stk_payment_state.dart';

/// Payment record for an errand (`payments`). Service fee, runner fee and
/// merchant amount are three separate payment flows; the app keeps no
/// stored balance. For the STK screen state use `StkPaymentState`.
class Payment {
  const Payment({
    required this.id,
    required this.errandId,
    required this.serviceFee,
    required this.runnerFee,
    required this.merchantAmount,
    required this.paymentFlow,
    required this.status,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String errandId;
  final String serviceFee;
  final String runnerFee;
  final String merchantAmount;
  final PaymentFlow paymentFlow;
  final PaymentStatus status;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
        id: json['id'] as String,
        errandId: json['errandId'] as String,
        serviceFee: parseDecimalOrZero(json['serviceFee']),
        runnerFee: parseDecimalOrZero(json['runnerFee']),
        merchantAmount: parseDecimalOrZero(json['merchantAmount']),
        paymentFlow: PaymentFlow.fromWire(json['paymentFlow'] as String),
        status: PaymentStatus.fromWire(json['status'] as String),
        createdAt: parseDate(json['createdAt']),
        updatedAt: parseDate(json['updatedAt']),
      );
}

/// One M-Pesa leg of a [Payment] (`payment_transactions`).
class PaymentTransaction {
  const PaymentTransaction({
    required this.id,
    required this.paymentId,
    required this.paymentTypeId,
    required this.amount,
    required this.status,
    this.mpesaReference,
    this.createdAt,
  });

  final String id;
  final String paymentId;
  final String paymentTypeId;
  final String amount;
  final PaymentTransactionStatus status;
  final String? mpesaReference;
  final DateTime? createdAt;

  factory PaymentTransaction.fromJson(Map<String, dynamic> json) =>
      PaymentTransaction(
        id: json['id'] as String,
        paymentId: json['paymentId'] as String,
        paymentTypeId: json['paymentTypeId'] as String,
        amount: parseDecimalOrZero(json['amount']),
        status: PaymentTransactionStatus.fromWire(json['status'] as String),
        mpesaReference: json['mpesaReference'] as String?,
        createdAt: parseDate(json['createdAt']),
      );
}

/// How the customer settles the merchant / item amount
/// (`merchantPayment` on payment responses). `null` on the payment when there
/// is no merchant amount (platform-only errand).
///
/// Till / Paybill fields are only ever set for [MerchantRoute.merchantDirect]
/// and stay `null` until the merchant's details exist (SQ-6): check
/// [hasMerchantDetails] before showing them.
class MerchantPayment {
  const MerchantPayment({
    required this.route,
    required this.amount,
    this.merchantName,
    this.tillNumber,
    this.paybillNumber,
    this.accountReference,
  });

  final MerchantRoute route;

  /// Amount still to pay the merchant / runner, as a decimal string.
  final String amount;
  final String? merchantName;
  final String? tillNumber;
  final String? paybillNumber;

  /// Paybill account number.
  final String? accountReference;

  /// True when a Till or Paybill number is known.
  bool get hasMerchantDetails => tillNumber != null || paybillNumber != null;

  /// Parses `merchantPayment`; `null` when absent or not readable.
  static MerchantPayment? tryParse(Object? json) {
    if (json is! Map) return null;
    final route = MerchantRoute.tryFromWire(json['route'] as String?);
    if (route == null) return null;
    return MerchantPayment(
      route: route,
      amount: parseDecimalOrZero(json['amount']),
      merchantName: parseOptionalString(json['merchantName']),
      tillNumber: parseOptionalString(json['tillNumber']),
      paybillNumber: parseOptionalString(json['paybillNumber']),
      accountReference: parseOptionalString(json['accountReference']),
    );
  }
}

/// Parses the server-computed `stkStatus` (`PENDING | SUCCESS | FAILED |
/// TIMEOUT`); `null` when absent or unknown.
StkPaymentState? parseStkStatus(Object? value) => switch (value) {
  'PENDING' => StkPaymentState.pending,
  'SUCCESS' => StkPaymentState.success,
  'FAILED' => StkPaymentState.failed,
  'TIMEOUT' => StkPaymentState.timeout,
  _ => null,
};

/// Response of `POST /payments/:errandId/initiate` (STK push sent).
///
/// [checkoutRequestId] is `PAID` when the errand was already paid and
/// `PENDING` when an earlier push is still outstanding (also what a retry
/// with the same `Idempotency-Key` returns).
class PaymentInitiation {
  const PaymentInitiation({
    required this.payment,
    required this.reference,
    required this.checkoutRequestId,
    required this.transactions,
    this.stkStatus,
    this.merchantPayment,
  });

  final Payment payment;
  final String reference;
  final String checkoutRequestId;
  final List<PaymentTransaction> transactions;

  /// Server-computed STK state (TIMEOUT after 120s without a provider
  /// answer); `null` from older API builds.
  final StkPaymentState? stkStatus;

  /// How the item amount is paid; `null` when there is none.
  final MerchantPayment? merchantPayment;

  bool get alreadyPaid => checkoutRequestId == 'PAID';
  bool get alreadyPending => checkoutRequestId == 'PENDING';

  factory PaymentInitiation.fromJson(Map<String, dynamic> json) =>
      PaymentInitiation(
        payment: Payment.fromJson(asJsonMap(json['payment'])),
        reference: json['reference'] as String? ?? '',
        checkoutRequestId: json['checkoutRequestId'] as String? ?? '',
        transactions: asJsonList(json['transactions'])
            .map(PaymentTransaction.fromJson)
            .toList(),
        stkStatus: parseStkStatus(json['stkStatus']),
        merchantPayment: MerchantPayment.tryParse(json['merchantPayment']),
      );
}

/// `GET /payments/:errandId`: the errand's main (service + runner fee)
/// payment (null if none yet), its legs, the server-computed [stkStatus]
/// and the [merchantPayment] instructions.
class PaymentSummary {
  const PaymentSummary({
    this.payment,
    this.transactions = const [],
    this.stkStatus,
    this.merchantPayment,
  });

  final Payment? payment;
  final List<PaymentTransaction> transactions;

  /// Server-computed STK state; `null` with no payment or an older API.
  final StkPaymentState? stkStatus;

  /// How the item amount is paid; `null` when there is none.
  final MerchantPayment? merchantPayment;

  factory PaymentSummary.fromJson(Map<String, dynamic> json) => PaymentSummary(
        payment: json['payment'] == null
            ? null
            : Payment.fromJson(asJsonMap(json['payment'])),
        transactions: asJsonList(json['transactions'])
            .map(PaymentTransaction.fromJson)
            .toList(),
        stkStatus: parseStkStatus(json['stkStatus']),
        merchantPayment: MerchantPayment.tryParse(json['merchantPayment']),
      );
}
