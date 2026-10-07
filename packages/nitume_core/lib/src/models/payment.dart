import 'enums.dart';
import 'json_utils.dart';

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

/// Response of `POST /payments/:errandId/initiate` (STK push sent).
///
/// [checkoutRequestId] is `PAID` when the errand was already paid and
/// `PENDING` when an earlier push is still outstanding.
class PaymentInitiation {
  const PaymentInitiation({
    required this.payment,
    required this.reference,
    required this.checkoutRequestId,
    required this.transactions,
  });

  final Payment payment;
  final String reference;
  final String checkoutRequestId;
  final List<PaymentTransaction> transactions;

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
      );
}

/// `GET /payments/:errandId`: the payment (null if none yet) and its legs.
class PaymentSummary {
  const PaymentSummary({this.payment, this.transactions = const []});

  final Payment? payment;
  final List<PaymentTransaction> transactions;

  factory PaymentSummary.fromJson(Map<String, dynamic> json) => PaymentSummary(
        payment: json['payment'] == null
            ? null
            : Payment.fromJson(asJsonMap(json['payment'])),
        transactions: asJsonList(json['transactions'])
            .map(PaymentTransaction.fromJson)
            .toList(),
      );
}
