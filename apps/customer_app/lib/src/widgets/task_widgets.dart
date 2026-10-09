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
  });

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
            chip ?? StatusChip.forStatus(errand.status),
            const SizedBox(height: 10),
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
  });

  final MerchantRoute? selected;
  final ValueChanged<MerchantRoute> onSelected;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Merchant details never reach the errand yet (SQ-6).
        const NitumeRadioRow(
          label: 'Pay merchant directly (recommended)',
          subtitle: "Available once the merchant's details are added.",
          selected: false,
          onSelected: null,
        ),
        const SizedBox(height: 8),
        NitumeRadioRow(
          label: 'Send purchase amount to runner',
          subtitle: "You'll get instructions after paying the fees.",
          selected: selected == MerchantRoute.sendToRunner,
          onSelected: enabled
              ? () => onSelected(MerchantRoute.sendToRunner)
              : null,
        ),
      ],
    );
  }
}

/// Fee rows for a recorded payment: `Service fee`, `Runner fee` and the
/// total of those two only (`_shared.md` §8), as returned by the API.
List<ReceiptRow> paidFeeRows(Payment p, {String totalLabel = 'Total paid'}) => [
  ReceiptRow(label: 'Service fee', amount: p.serviceFee),
  ReceiptRow(label: 'Runner fee', amount: p.runnerFee),
  ReceiptRow(
    label: totalLabel,
    amount: addDecimals(p.serviceFee, p.runnerFee),
    isTotal: true,
  ),
];

/// The item amount kept apart from the fee total, with its route line.
ReceiptSeparateGroup? itemAmountGroup(Payment p) {
  if (!isPositiveAmount(p.merchantAmount)) return null;
  final note = switch (p.paymentFlow) {
    PaymentFlow.merchantDirect => 'Paid to the merchant directly',
    PaymentFlow.customerToRunner => 'Sent to your runner',
    _ => null,
  };
  return ReceiptSeparateGroup(
    rows: [ReceiptRow(label: 'Item amount', amount: p.merchantAmount)],
    note: note,
  );
}
