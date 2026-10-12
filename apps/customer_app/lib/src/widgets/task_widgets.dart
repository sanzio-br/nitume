import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../util/display.dart';

/// Task summary card (C-07 + C-05): status chip, title, Fira Code
/// `#NT-10482 · Today, 10:03 AM`. Used by `x-awaiting-quote` and
/// `v-task-detail`.
class TaskSummaryCard extends StatelessWidget {
  const TaskSummaryCard({
    super.key,
    required this.errand,
    this.chip,
    this.titleStyle,
    this.showChip = true,
  });

  /// `false` hides the chip (expired quote: the UI never invents a label).
  final bool showChip;

  final Errand errand;

  /// Defaults to the errand's status chip (`_shared.md` §6).
  final Widget? chip;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    final meta = errandRefMeta(errand);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: NitumeCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showChip) ...[
              chip ?? StatusChip.forStatus(errand.status),
              const SizedBox(height: 10),
            ],
            Text(
              errandTitle(errand),
              style: titleStyle ?? NitumeTextStyles.cardTitle,
            ),
            if (meta.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(meta, style: NitumeTextStyles.metaLarge),
            ],
          ],
        ),
      ),
    );
  }
}

/// Label of the fee total on every quote / checkout card (mockup copy).
const kFeeTotalLabel = 'Total (service + runner fee)';

/// Merchant route rows (C-16 radio-row variant) shared by the checkout and
/// the price-change modal (OA-5). Merchant-direct stays disabled until the
/// errand has merchant details (SQ-6); runner advance is never offered.
class MerchantRouteRows extends StatelessWidget {
  const MerchantRouteRows({
    super.key,
    required this.selected,
    required this.onSelected,
    this.enabled = true,
    this.merchantDetailsAvailable = false,
  });

  final MerchantRoute? selected;
  final ValueChanged<MerchantRoute> onSelected;
  final bool enabled;

  /// Merchant Till/Paybill details exist (row 43): merchant-direct enables.
  final bool merchantDetailsAvailable;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Details come from the merchant or an admin (row 43).
        NitumeRadioRow(
          label: 'Pay merchant directly (recommended)',
          subtitle: merchantDetailsAvailable
              ? "You'll see the merchant's Till or Paybill number after "
                    'paying the fees.'
              : "Available once the merchant's details are added.",
          selected: selected == MerchantRoute.merchantDirect,
          onSelected: merchantDetailsAvailable && enabled
              ? () => onSelected(MerchantRoute.merchantDirect)
              : null,
        ),
        const SizedBox(height: 8),
        NitumeRadioRow(
          label: 'Send purchase amount to runner',
          // Row 76: one combined STK to Nitume (fees + item amount).
          subtitle:
              "You'll pay this amount to Nitume by M-Pesa together with "
              "the fees, for your runner's purchase.",
          selected: selected == MerchantRoute.sendToRunner,
          onSelected: enabled
              ? () => onSelected(MerchantRoute.sendToRunner)
              : null,
        ),
      ],
    );
  }
}

/// The single fee row (row 34): `Total (service + runner fee)` with the
/// API's fee total (errand `feeTotal`, else the payment's two fees as
/// recorded). Never split, never including the item amount.
List<ReceiptRow> feeTotalRows(Payment p, {String? feeTotal}) => [
  ReceiptRow(
    label: kFeeTotalLabel,
    amount: feeTotal ?? addDecimals(p.serviceFee, p.runnerFee),
    isTotal: true,
  ),
];

/// The item amount kept apart from the fee total, with its route line.
ReceiptSeparateGroup? itemAmountGroup(Payment p) {
  if (!isPositiveAmount(p.merchantAmount)) return null;
  final note = switch (p.paymentFlow) {
    PaymentFlow.merchantDirect => 'Paid to the merchant directly',
    PaymentFlow.customerToRunner => 'Paid to Nitume for your runner',
    _ => null,
  };
  return ReceiptSeparateGroup(
    rows: [ReceiptRow(label: 'Item amount', amount: p.merchantAmount)],
    note: note,
  );
}

/// Refund group (`_shared.md` §11, row 54): status chip, status line and,
/// for approved / refunded, the refund amount. Never the decision note.
class RefundGroup extends StatelessWidget {
  const RefundGroup({super.key, required this.refund});

  final CustomerRefund refund;

  static ({String chip, StatusTone tone}) _chip(RefundStatus s) => switch (s) {
    RefundStatus.pendingReview => (
      chip: 'Refund under review',
      tone: StatusTone.pending,
    ),
    RefundStatus.approved => (chip: 'Refund approved', tone: StatusTone.info),
    RefundStatus.refunded => (chip: 'Refunded', tone: StatusTone.success),
    RefundStatus.noRefund => (chip: 'No refund', tone: StatusTone.info),
  };

  @override
  Widget build(BuildContext context) {
    final c = _chip(refund.status);
    final style = NitumeTextStyles.muted;
    final Widget line = switch (refund.status) {
      // Row 102: paid EXPIRED / FAILED tasks get trigger-specific lines.
      // Never say a refund is automatic: it is a review.
      RefundStatus.pendingReview => Text(switch (refund.trigger) {
        RefundTrigger.expiredAfterPayment =>
          "We couldn't find a runner for this task in time. We're reviewing "
              'a refund and will let you know the outcome.',
        RefundTrigger.failedAfterPayment =>
          "This task couldn't be completed. We're reviewing a refund and "
              'will let you know the outcome.',
        _ =>
          "We're reviewing a refund for this task. We'll let you know the "
              'outcome.',
      }, style: style),
      RefundStatus.approved => Text(
        "We'll send you this refund and update this page when it's sent.",
        style: style,
      ),
      RefundStatus.refunded => Text.rich(
        TextSpan(
          text: 'Sent',
          children: [
            if (refund.paidAt != null)
              TextSpan(
                text: ' ${formatDayTime(refund.paidAt!)}',
                style: NitumeTypography.numeric(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  color: NitumeColors.slate600,
                ),
              ),
          ],
        ),
        style: style,
      ),
      RefundStatus.noRefund => Text(
        'After review, no refund is due for this task.',
        style: style,
      ),
    };
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.only(top: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: NitumeColors.slateLine)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Refund',
                  style: NitumeTextStyles.body.copyWith(fontSize: 13),
                ),
              ),
              StatusChip(label: c.chip, tone: c.tone),
            ],
          ),
          const SizedBox(height: 6),
          line,
          if (refund.showsAmount)
            ReceiptRow(label: 'Refund amount', amount: refund.refundAmount),
        ],
      ),
    );
  }
}
