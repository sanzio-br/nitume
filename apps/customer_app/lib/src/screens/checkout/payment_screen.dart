import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/stk_view.dart';

enum _Phase { loading, loadError, initiating, initiateError, stk }

/// `v-payment`: M-Pesa STK push for the fee total (plus the item amount for
/// `send_to_runner`, one combined STK, row 76), followed
/// to PENDING / SUCCESS / FAILED / TIMEOUT (OA-21). TIMEOUT is not a
/// failure: the screen keeps checking.
class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.args});

  final PaymentArgs args;

  /// Client-side TIMEOUT used only when the API sends no `stkStatus`; never
  /// shorter than the server's 120 s (rows 52, 63).
  static const confirmationWindow = Duration(seconds: 120);

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  late final AppServices _services = context.services;
  _Phase _phase = _Phase.loading;
  StkPaymentState _stk = StkPaymentState.pending;
  Payment? _payment;
  String? _payer;
  DateTime _startedAt = DateTime.now();
  bool _busy = false;
  bool _stillPending = false;
  bool _retriedReusedKey = false;
  Timer? _timer;
  Timer? _leave;

  String get _id => widget.args.errandId;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _leave?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() => _phase = _Phase.loading);
    try {
      final results = await Future.wait<Object>([
        _services.errands.get(_id),
        _services.payments.forErrand(_id),
      ]);
      final errand = results[0] as Errand;
      final summary = results[1] as PaymentSummary;
      _payer = await _payerNumber();
      if (!mounted) return;
      final p = summary.payment;
      if (p != null) {
        _payment = p;
        _startedAt = p.createdAt ?? DateTime.now();
        final s = StkPaymentState.fromSummary(
          summary,
          elapsed: DateTime.now().difference(_startedAt),
          confirmationWindow: PaymentScreen.confirmationWindow,
        );
        // Reopening never sends a second prompt by itself.
        if (s != StkPaymentState.failed || !widget.args.fromCheckout) {
          _apply(s);
          return;
        }
        _services.paymentAttempts.newAttempt(_id);
      } else if (errand.status == ErrandStatus.requested ||
          errand.status == ErrandStatus.quoted) {
        Nav.replaceWithAwaitingQuote(context, _id);
        return;
      } else if (errand.status != ErrandStatus.accepted) {
        if (ErrandRepository.activeStatuses.contains(errand.status)) {
          Nav.resetToTrack(context, _id);
        } else {
          Nav.replaceWithTaskDetail(context, _id);
        }
        return;
      } else if (!widget.args.fromCheckout && isPositiveAmount(errand.budget)) {
        // The item-amount route is chosen at checkout (OA-5).
        Nav.replaceWithAwaitingQuote(context, _id);
        return;
      }
      await _initiate();
    } on Object {
      if (mounted) setState(() => _phase = _Phase.loadError);
    }
  }

  Future<String?> _payerNumber() async {
    final chosen = widget.args.method;
    if (chosen != null) return chosen.detail;
    try {
      final methods = await _services.account.paymentMethods();
      for (final m in methods) {
        if (m.isDefault) return m.detail;
      }
    } on Object {
      // Fall back to the sign-in phone.
    }
    final phone = _services.session.user?.phone;
    return phone == null ? null : formatPhoneIntl(phone);
  }

  Future<void> _initiate() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _phase = _Phase.initiating;
      _stillPending = false;
    });
    try {
      final r = await _services.payments.initiateWith(
        _id,
        idempotencyKey: _services.paymentAttempts.keyFor(_id),
        merchantRoute: widget.args.route,
        paymentMethodId: widget.args.method?.id,
      );
      if (!mounted) return;
      _busy = false;
      _payment = r.payment;
      _startedAt = DateTime.now();
      _apply(
        r.alreadyPaid
            ? StkPaymentState.success
            : r.stkStatus ?? StkPaymentState.pending,
      );
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      _busy = false;
      if (e.code == ApiErrorCodes.idempotencyKeyReused && !_retriedReusedKey) {
        _retriedReusedKey = true;
        _services.paymentAttempts.newAttempt(_id);
        return _initiate();
      }
      if (e.code == ApiErrorCodes.quoteNotAccepted) {
        // A re-quote must be accepted first (row 72): back to checkout.
        Nav.replaceWithAwaitingQuote(context, _id);
        return;
      }
      if (e.code == ApiErrorCodes.quoteExpired) {
        Nav.replaceWithAwaitingQuote(context, _id, quoteExpired: true);
        return;
      }
      if (e.code == ApiErrorCodes.merchantRouteRequired) {
        Nav.replaceWithAwaitingQuote(context, _id);
        return;
      }
      // Network / server error: "Try again" reuses the same key.
      setState(() => _phase = _Phase.initiateError);
    }
  }

  void _apply(StkPaymentState s) {
    _timer?.cancel();
    setState(() {
      _phase = _Phase.stk;
      _stk = s;
    });
    if (s.isConfirmed) {
      _leave = Timer(const Duration(milliseconds: 1500), () {
        if (mounted) Nav.resetToTrack(context, _id);
      });
    } else if (s.keepChecking) {
      _schedule();
    }
  }

  /// Polls every 5 s, then every 30 s, for up to 10 minutes (until the
  /// Socket.IO client is approved, row 29).
  void _schedule() {
    if (!_services.pollingEnabled) return;
    final elapsed = DateTime.now().difference(_startedAt);
    if (elapsed > const Duration(minutes: 10)) return;
    final wait = elapsed < const Duration(minutes: 2)
        ? const Duration(seconds: 5)
        : const Duration(seconds: 30);
    _timer = Timer(wait, () {
      if (!mounted) return;
      if (isRouteVisible(context)) {
        _check(manual: false);
      } else {
        _schedule();
      }
    });
  }

  Future<void> _check({required bool manual}) async {
    if (_busy) return;
    _busy = true;
    if (manual) setState(() {});
    try {
      final summary = await _services.payments.forErrand(_id);
      if (!mounted) return;
      _busy = false;
      if (summary.payment != null) _payment = summary.payment;
      final s = StkPaymentState.fromSummary(
        summary,
        elapsed: DateTime.now().difference(_startedAt),
        confirmationWindow: PaymentScreen.confirmationWindow,
      );
      _stillPending = manual && s.keepChecking;
      _apply(s);
    } on Object catch (e) {
      if (!mounted) return;
      _busy = false;
      if (manual) {
        setState(() {});
        showSnack(context, friendlyError(e));
      }
      _schedule();
    }
  }

  /// `send_to_runner`: the item amount is part of the same STK (row 76).
  Widget? _itemCaption() {
    final p = _payment;
    if (p == null ||
        p.paymentFlow != PaymentFlow.customerToRunner ||
        !isPositiveAmount(p.merchantAmount)) {
      return null;
    }
    return Text.rich(
      TextSpan(
        children: [
          const TextSpan(text: 'Includes '),
          NumSpan.kes(p.merchantAmount),
          const TextSpan(text: " for your runner's purchase."),
        ],
      ),
      textAlign: TextAlign.center,
      style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
    );
  }

  void _newAttempt() {
    _services.paymentAttempts.newAttempt(_id);
    _retriedReusedKey = false;
    _initiate();
  }

  @override
  Widget build(BuildContext context) {
    final Widget content = switch (_phase) {
      _Phase.loading => const Center(child: PulsingDots()),
      _Phase.loadError => NitumeErrorState(
        message: "Couldn't load this payment.",
        onRetry: _start,
      ),
      _ => StkStatusView(
        phase: _phase == _Phase.initiating
            ? StkPhase.initiating
            : _phase == _Phase.initiateError
            ? StkPhase.initiateError
            : StkPhase.stk,
        stk: _stk,
        payer: _payer,
        amount: _payment == null ? null : chargedAmount(_payment!),
        caption: _itemCaption(),
        busy: _busy,
        stillPending: _stillPending,
        onCheck: () => _check(manual: true),
        onInitiate: _initiate,
        onNewAttempt: _newAttempt,
        onBack: () => Navigator.of(context).maybePop(),
      ),
    };
    return PushedScaffold(title: 'Payment', body: content);
  }
}
