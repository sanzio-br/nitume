import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../services/live_updates.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/stk_view.dart';

/// `x-merchant-payment`: what is still due for the item amount and where,
/// kept apart from the fees.
///
/// * Variant A, `merchant_direct`: the customer pays the merchant's
///   Till/Paybill from their own M-Pesa; Nitume does not collect it.
/// * Variant B, `send_to_runner`: the original item amount is part of the
///   combined fee STK (row 76), so this screen only follows a price-change
///   difference charged to Nitume by STK (rows 42, 44), with the
///   `v-payment` state table and `retryDifferencePayment` after FAILED.
/// * Nothing due: closes with `Nothing to pay right now.`
class MerchantPaymentScreen extends StatefulWidget {
  const MerchantPaymentScreen({
    super.key,
    required this.errandId,
    this.approvedIncrease,
    this.priceChangeRequestId,
  });

  final String errandId;

  /// Increase just approved on `v-price-auth` (decimal string).
  final String? approvedIncrease;

  /// Request of that increase (needed to retry its STK).
  final String? priceChangeRequestId;

  @override
  State<MerchantPaymentScreen> createState() => _MerchantPaymentScreenState();
}

/// The send-to-runner difference still being paid, if any.
ItemPayment? outstandingDifference(PaymentSummary s) {
  for (final d in s.differencePayments) {
    final toNitume =
        d.merchantPayment?.paidToNitume ??
        d.payment.paymentFlow == PaymentFlow.customerToRunner;
    if (toNitume && d.payment.status != PaymentStatus.completed) return d;
  }
  return null;
}

class _MerchantPaymentScreenState extends State<MerchantPaymentScreen> {
  late final AppServices _services = context.services;
  PaymentSummary? _summary;
  Object? _error;
  Timer? _timer;
  bool _busy = false;
  bool _stillPending = false;
  bool _closing = false;
  final DateTime _openedAt = DateTime.now();

  ErrandWatch? _watch;

  @override
  void initState() {
    super.initState();
    _load();
    // New Till/Paybill details (row 43) and status changes refresh.
    _watch = _services.live.watch(
      widget.errandId,
      onMerchantDetails: (_) => _load(),
      onStatus: (_) => _load(),
      onReconnected: _load,
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _watch?.cancel();
    super.dispose();
  }

  /// The difference's request: passed from the price-change modal, else
  /// read from the payment (opened from Track or Task detail).
  String? get _requestId {
    final s = _summary;
    final d = s == null ? null : outstandingDifference(s);
    return widget.priceChangeRequestId ?? d?.payment.priceChangeRequestId;
  }

  Future<void> _load({bool manual = false}) async {
    _timer?.cancel();
    if (manual) setState(() => _busy = true);
    try {
      final s = await _services.payments.forErrand(widget.errandId);
      if (!mounted) return;
      final diff = outstandingDifference(s);
      setState(() {
        _summary = s;
        _error = null;
        _busy = false;
        _stillPending =
            manual && (diff?.stkStatus ?? StkPaymentState.pending).keepChecking;
      });
      _closeIfNothingDue(s);
      if (diff != null &&
          (diff.stkStatus ?? StkPaymentState.pending).keepChecking) {
        _schedule();
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        if (_summary == null) _error = e;
      });
      if (_summary != null) _schedule();
    }
  }

  /// Poll the difference STK: every 5 s, then 30 s, up to 10 minutes.
  void _schedule() {
    if (!_services.pollingEnabled) return;
    final elapsed = DateTime.now().difference(_openedAt);
    if (elapsed > const Duration(minutes: 10)) return;
    _timer = Timer(
      elapsed < const Duration(minutes: 2)
          ? const Duration(seconds: 5)
          : const Duration(seconds: 30),
      () {
        if (mounted && isRouteVisible(context)) {
          _load();
        } else if (mounted) {
          _schedule();
        }
      },
    );
  }

  void _closeIfNothingDue(PaymentSummary s) {
    final mp = s.merchantPayment;
    final directDue =
        mp != null &&
        mp.route == MerchantRoute.merchantDirect &&
        isPositiveAmount(mp.amount);
    if (directDue || s.differencePayments.isNotEmpty && _anyDifference(s)) {
      return;
    }
    if (_closing) return;
    _closing = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showSnack(context, 'Nothing to pay right now.');
      Navigator.of(context).maybePop();
    });
  }

  /// A send-to-runner difference exists (paid or not): keep the STK view so
  /// a just-confirmed payment shows its success state.
  bool _anyDifference(PaymentSummary s) => s.differencePayments.any(
    (d) =>
        d.merchantPayment?.paidToNitume ??
        d.payment.paymentFlow == PaymentFlow.customerToRunner,
  );

  Future<void> _retryDifference() async {
    final id = _requestId;
    if (id == null || _busy) return;
    setState(() => _busy = true);
    try {
      await _services.payments.retryDifferencePayment(widget.errandId, id);
      if (mounted) await _load();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showSnack(context, friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    final mp = s?.merchantPayment;
    final diff = s == null ? null : outstandingDifference(s);
    final latestToNitume = s?.differencePayments
        .where(
          (d) =>
              d.merchantPayment?.paidToNitume ??
              d.payment.paymentFlow == PaymentFlow.customerToRunner,
        )
        .firstOrNull;
    final Widget body;
    var title = 'Pay the merchant';
    Widget? cta = FixedCta(
      child: NitumeButton.primary(
        label: 'Done',
        expand: true,
        onPressed: () => Navigator.of(context).maybePop(),
      ),
    );
    if (_error != null) {
      body = NitumeErrorState(
        message: "Couldn't load the payment details.",
        onRetry: () {
          setState(() => _error = null);
          _load();
        },
      );
    } else if (s == null) {
      body = const SkeletonList(count: 1, height: 220);
    } else if (diff != null ||
        (latestToNitume != null && mp?.route != MerchantRoute.merchantDirect)) {
      final shown = diff ?? latestToNitume!;
      final state = shown.payment.status == PaymentStatus.completed
          ? StkPaymentState.success
          : shown.stkStatus ?? StkPaymentState.pending;
      title = 'Pay the item amount';
      cta = null;
      body = StkStatusView(
        phase: StkPhase.stk,
        stk: state,
        copy: StkCopy.items,
        payer: null,
        amount: shown.amount,
        busy: _busy,
        stillPending: _stillPending,
        onCheck: () => _load(manual: true),
        // FAILED → a new STK for the difference; TIMEOUT → the API returns
        // the pending charge as is (no second push).
        onInitiate: _retryDifference,
        onNewAttempt: _requestId == null
            ? () => _load(manual: true)
            : _retryDifference,
        onBack: () => Navigator.of(context).maybePop(),
        onDone: () => Navigator.of(context).maybePop(),
      );
    } else if (mp != null &&
        mp.route == MerchantRoute.merchantDirect &&
        isPositiveAmount(mp.amount)) {
      body = mp.hasMerchantDetails
          ? _MerchantDirect(mp: mp, increase: widget.approvedIncrease)
          : _DetailsPending(amount: mp.amount);
    } else {
      body = const SizedBox.shrink();
    }
    return PushedScaffold(title: title, body: body, cta: cta);
  }
}

/// Variant A without Till/Paybill details yet (row 43).
class _DetailsPending extends StatelessWidget {
  const _DetailsPending({required this.amount});

  final String amount;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: NitumeCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: CopyableValueRow(
              label: 'Amount',
              value: formatKes(amount),
              style: CopyableValueStyle.amount,
              copyable: false,
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: NitumeNotice(
            message:
                "The merchant's details aren't available yet. We'll notify "
                'you when they are.',
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
