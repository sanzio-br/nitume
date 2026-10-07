import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

enum _Phase { loading, loadError, initiating, initiateError, stk }

/// `v-payment`: M-Pesa STK push for the service + runner fee only, followed
/// to PENDING / SUCCESS / FAILED / TIMEOUT (OA-21). TIMEOUT is not a
/// failure: the screen keeps checking.
class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.args});

  final PaymentArgs args;

  /// Client-side TIMEOUT when the API reports none (spec: 90 s).
  static const confirmationWindow = Duration(seconds: 90);

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
      _ => _StkView(
        phase: _phase,
        stk: _stk,
        payer: _payer,
        amount: _payment == null
            ? null
            : addDecimals(_payment!.serviceFee, _payment!.runnerFee),
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

class _StkView extends StatelessWidget {
  const _StkView({
    required this.phase,
    required this.stk,
    required this.payer,
    required this.amount,
    required this.busy,
    required this.stillPending,
    required this.onCheck,
    required this.onInitiate,
    required this.onNewAttempt,
    required this.onBack,
  });

  final _Phase phase;
  final StkPaymentState stk;
  final String? payer;
  final String? amount;
  final bool busy;
  final bool stillPending;
  final VoidCallback onCheck;
  final VoidCallback onInitiate;
  final VoidCallback onNewAttempt;
  final VoidCallback onBack;

  Widget _promptBody() {
    if (payer == null) {
      return const Text(
        'Enter your M-Pesa PIN on the prompt sent to your phone to confirm '
        'this payment.',
      );
    }
    return Text.rich(
      TextSpan(
        text: 'Enter your M-Pesa PIN on the prompt sent to ',
        children: [
          TextSpan(
            text: payer,
            style: NitumeTypography.numeric(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              color: NitumeColors.slate600,
            ),
          ),
          const TextSpan(text: ' to confirm this payment.'),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final String heading;
    final Widget body;
    final List<Widget> buttons;
    var icon = _Icon.phone;
    var dots = false;

    if (phase == _Phase.initiating) {
      heading = 'Check your phone';
      body = _promptBody();
      buttons = [
        const NitumeButton.primary(label: 'Sending prompt…', onPressed: null),
      ];
    } else if (phase == _Phase.initiateError) {
      heading = "Couldn't send the prompt";
      body = const Text('Check your connection and try again.');
      icon = _Icon.failed;
      buttons = [
        NitumeButton.primary(label: 'Try again', onPressed: onInitiate),
        NitumeButton.outline(label: 'Back', onPressed: onBack),
      ];
    } else {
      switch (stk) {
        case StkPaymentState.pending:
          heading = 'Check your phone';
          body = _promptBody();
          dots = true;
          buttons = [
            NitumeButton.primary(
              label: "I've paid — continue",
              loading: busy,
              onPressed: onCheck,
            ),
          ];
        case StkPaymentState.success:
          heading = 'Payment received';
          body = const Text("Thanks. We're finding a runner for your task.");
          icon = _Icon.success;
          buttons = const [];
        case StkPaymentState.failed:
          heading = "Payment didn't go through";
          body = const Text(
            "M-Pesa didn't confirm this payment. You haven't been charged. "
            'You can try again.',
          );
          icon = _Icon.failed;
          buttons = [
            NitumeButton.primary(label: 'Try again', onPressed: onNewAttempt),
            NitumeButton.outline(label: 'Back', onPressed: onBack),
          ];
        case StkPaymentState.timeout:
          heading = 'Still checking your payment';
          body = const Text(
            "M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay "
            "again. We'll update this screen as soon as we hear back.",
          );
          buttons = [
            NitumeButton.primary(
              label: 'Check again',
              loading: busy,
              onPressed: onCheck,
            ),
            NitumeButton.outline(
              label: 'Send a new prompt',
              onPressed: busy ? null : onNewAttempt,
            ),
          ];
      }
    }

    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 30),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: c.maxHeight),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _StateIcon(icon),
              const SizedBox(height: 20),
              Semantics(
                liveRegion: true,
                header: true,
                child: Text(
                  heading,
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.dialogTitle.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 260),
                child: DefaultTextStyle.merge(
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.muted,
                  child: body,
                ),
              ),
              const SizedBox(height: 22),
              if (amount != null) ...[
                NumText.kes(amount!, fontSize: 30, fontWeight: FontWeight.w600),
                const SizedBox(height: 26),
              ],
              if (dots) ...[
                const PulsingDots(
                  semanticLabel: 'Waiting for M-Pesa confirmation',
                ),
                const SizedBox(height: 30),
              ],
              SizedBox(
                width: 220,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < buttons.length; i++) ...[
                      if (i > 0) const SizedBox(height: 10),
                      buttons[i],
                    ],
                  ],
                ),
              ),
              if (stillPending && stk == StkPaymentState.pending) ...[
                const SizedBox(height: 12),
                Text(
                  "We haven't heard from M-Pesa yet. Keep this screen open.",
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum _Icon { phone, success, failed }

/// 64px circle: green-050 + green phone (waiting), green-050 + green check
/// (success), slate + slate-line border + blue phone (failed; red is not
/// allowed here, OA-13).
class _StateIcon extends StatelessWidget {
  const _StateIcon(this.kind);

  final _Icon kind;

  @override
  Widget build(BuildContext context) {
    final failed = kind == _Icon.failed;
    return ExcludeSemantics(
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: failed ? NitumeColors.slate : NitumeColors.green050,
          border: failed ? Border.all(color: NitumeColors.slateLine) : null,
        ),
        child: Icon(
          kind == _Icon.success
              ? Icons.check_rounded
              : Icons.phone_iphone_rounded,
          size: 28,
          color: failed ? NitumeColors.blue : NitumeColors.green,
        ),
      ),
    );
  }
}
