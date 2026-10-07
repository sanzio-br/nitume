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

/// Quote rows as the API returns them (`GET /errands/:id/quote`).
///
/// TODO(pending row 34): which components make up "Service fee" and
/// "Runner fee" is not decided, so the components are listed by name and the
/// client never groups or computes them. Zero components are skipped.
List<ReceiptRow> quoteRows(Quote quote) {
  final parts = <(String, String)>[
    ('Base fee', quote.baseFee),
    ('Distance fee', quote.distanceFee),
    ('Time fee', quote.timeFee),
    ('Urgency fee', quote.urgencyFee),
    ('Complexity fee', quote.complexityFee),
    ('Premium fee', quote.premiumFee),
  ];
  return [
    for (final (label, amount) in parts)
      if (isPositiveAmount(amount)) ReceiptRow(label: label, amount: amount),
    ReceiptRow(label: 'Total', amount: quote.total, isTotal: true),
  ];
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
