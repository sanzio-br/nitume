import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

/// `x-merchant-payment`: what to pay for the item amount and where, kept
/// apart from the fees (three flows separate). Nitume does not collect this
/// money on the merchant-direct route.
class MerchantPaymentScreen extends StatefulWidget {
  const MerchantPaymentScreen({
    super.key,
    required this.errandId,
    this.approvedIncrease,
  });

  final String errandId;

  /// Increase just approved on `v-price-auth` (decimal string).
  final String? approvedIncrease;

  @override
  State<MerchantPaymentScreen> createState() => _MerchantPaymentScreenState();
}

class _MerchantPaymentScreenState extends State<MerchantPaymentScreen> {
  late Future<PaymentSummary> _future;

  @override
  void initState() {
    super.initState();
    _future = context.services.payments.forErrand(widget.errandId);
  }

  void _retry() {
    final future = context.services.payments.forErrand(widget.errandId);
    setState(() {
      _future = future;
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PaymentSummary>(
      future: _future,
      builder: (context, snap) {
        final mp = snap.data?.merchantPayment;
        final runnerRoute = mp?.route == MerchantRoute.sendToRunner;
        final Widget body;
        if (snap.connectionState != ConnectionState.done) {
          body = const SkeletonList(count: 1, height: 220);
        } else if (snap.hasError) {
          body = NitumeErrorState(
            message: "Couldn't load the payment details.",
            onRetry: _retry,
          );
        } else if (mp == null || !isPositiveAmount(mp.amount)) {
          body = const _Notice(
            "The merchant's details aren't available yet. We'll notify you "
            'when they are.',
          );
        } else if (runnerRoute) {
          body = _SendToRunner(amount: mp.amount);
        } else if (!mp.hasMerchantDetails) {
          body = const _Notice(
            "The merchant's details aren't available yet. We'll notify you "
            'when they are.',
          );
        } else {
          body = _MerchantDirect(mp: mp, increase: widget.approvedIncrease);
        }
        return PushedScaffold(
          title: runnerRoute ? 'Pay your runner' : 'Pay the merchant',
          body: body,
          cta: FixedCta(
            child: NitumeButton.primary(
              label: 'Done',
              expand: true,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
        );
      },
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => ListView(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
        child: NitumeNotice(message: message),
      ),
    ],
  );
}

/// Variant B. Blocked on SQ-5 (BOARD row 42): how the customer sends the
/// item amount is undecided, so only the amount and a pending notice show.
class _SendToRunner extends StatelessWidget {
  const _SendToRunner({required this.amount});

  final String amount;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: NitumeCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CopyableValueRow(
                  label: 'Amount',
                  value: formatKes(amount),
                  style: CopyableValueStyle.amount,
                  copyable: false,
                ),
                const SizedBox(height: 4),
                const NitumeNotice(
                  message:
                      "We'll show you how to send this amount to your "
                      'runner here.',
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Variant A: merchant Till or Paybill.
class _MerchantDirect extends StatelessWidget {
  const _MerchantDirect({required this.mp, required this.increase});

  final MerchantPayment mp;
  final String? increase;

  @override
  Widget build(BuildContext context) {
    final till = mp.tillNumber != null;
    const hairline = Divider(height: 1, color: NitumeColors.slateLine);
    final rows = <Widget>[
      if (mp.merchantName != null)
        CopyableValueRow(
          label: 'Merchant',
          value: mp.merchantName!,
          style: CopyableValueStyle.text,
          copyable: false,
        ),
      if (till)
        CopyableValueRow(
          label: 'Till number (Buy Goods)',
          value: mp.tillNumber!,
        )
      else ...[
        CopyableValueRow(label: 'Paybill number', value: mp.paybillNumber!),
        if (mp.accountReference != null)
          CopyableValueRow(
            label: 'Account number',
            value: mp.accountReference!,
          ),
      ],
      CopyableValueRow(
        label: 'Amount',
        value: formatKes(mp.amount),
        copyValue: plainAmount(mp.amount),
        style: CopyableValueStyle.amount,
      ),
    ];
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Pay the merchant directly',
                style: NitumeTextStyles.dialogTitle.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                "Pay this amount from your M-Pesa straight to the merchant. "
                "It's separate from the fees you've already paid.",
                style: NitumeTextStyles.muted,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: NitumeCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  if (i > 0) hairline,
                  rows[i],
                ],
              ],
            ),
          ),
        ),
        if (increase != null && isPositiveAmount(increase))
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Text.rich(
              TextSpan(
                text: 'Includes the ',
                children: [
                  TextSpan(
                    text: formatKes(increase!),
                    style: NitumeTypography.numeric(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: NitumeDesignChoices.priceChangeAmount,
                    ),
                  ),
                  const TextSpan(text: ' increase you approved.'),
                ],
              ),
              style: NitumeTextStyles.body.copyWith(fontSize: 12.5),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: Text(
            till
                ? 'On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, '
                      'enter the Till number and amount.'
                : 'On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the '
                      'Paybill number, account number and amount.',
            style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
          ),
        ),
      ],
    );
  }
}
