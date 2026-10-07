import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/task_widgets.dart';

class _QuoteData {
  const _QuoteData({
    required this.errand,
    this.quote,
    this.methods = const [],
    this.phone,
  });

  final Errand errand;
  final Quote? quote;
  final List<PaymentMethod> methods;

  /// Sign-in phone, the payer fallback (OA-21).
  final String? phone;
}

/// `x-awaiting-quote`: waiting (REQUESTED), then checkout (QUOTED): accept
/// the final quote, choose the item-amount route (OA-5) and the M-Pesa
/// number, then pay.
class AwaitingQuoteScreen extends StatefulWidget {
  const AwaitingQuoteScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<AwaitingQuoteScreen> createState() => _AwaitingQuoteScreenState();
}

class _AwaitingQuoteScreenState extends State<AwaitingQuoteScreen> {
  late final AppServices _services = context.services;
  _QuoteData? _data;
  Object? _error;
  Poller? _poller;
  MerchantRoute? _route;
  PaymentMethod? _method;
  bool _accepting = false;
  bool _cancelling = false;
  bool _routed = false;

  @override
  void initState() {
    super.initState();
    _load();
    _poller = Poller(
      interval: const Duration(seconds: 15),
      enabled: _services.pollingEnabled,
      isVisible: () =>
          mounted &&
          isRouteVisible(context) &&
          _data?.errand.status == ErrandStatus.requested,
      onTick: _refreshErrand,
    );
  }

  @override
  void dispose() {
    _poller?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _data = null;
    });
    try {
      final errand = await _services.errands.get(widget.errandId);
      if (_routeAway(errand)) return;
      final data = await _checkoutData(errand);
      if (mounted) setState(() => _data = data);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Entry rules: later states leave this screen.
  bool _routeAway(Errand errand) {
    if (_routed || !mounted) return true;
    final s = errand.status;
    if (s == ErrandStatus.requested ||
        s == ErrandStatus.quoted ||
        s == ErrandStatus.accepted) {
      return false;
    }
    _routed = true;
    if (ErrandRepository.activeStatuses.contains(s)) {
      Nav.resetToTrack(context, errand.id);
    } else {
      Nav.replaceWithTaskDetail(context, errand.id);
    }
    return true;
  }

  Future<_QuoteData> _checkoutData(Errand errand) async {
    if (errand.status == ErrandStatus.requested) {
      return _QuoteData(errand: errand);
    }
    final results = await Future.wait<Object?>([
      _services.errands.quote(errand.id),
      _services.account.paymentMethods().catchError(
        (Object _) => <PaymentMethod>[],
      ),
    ]);
    final methods = results[1]! as List<PaymentMethod>;
    _method ??= _defaultMethod(methods);
    _route ??= MerchantRoute.sendToRunner;
    return _QuoteData(
      errand: errand,
      quote: results[0] as Quote?,
      methods: methods,
      phone: _services.session.user?.phone,
    );
  }

  static PaymentMethod? _defaultMethod(List<PaymentMethod> methods) {
    for (final m in methods) {
      if (m.isDefault) return m;
    }
    return methods.isEmpty ? null : methods.first;
  }

  Future<void> _refreshErrand() async {
    final errand = await _services.errands.get(widget.errandId);
    if (!mounted || _routeAway(errand)) return;
    final was = _data?.errand.status;
    if (was == errand.status) return;
    final data = await _checkoutData(errand);
    if (!mounted) return;
    setState(() => _data = data);
    if (was == ErrandStatus.requested && errand.status == ErrandStatus.quoted) {
      SemanticsService.sendAnnouncement(
        View.of(context),
        'Your quote is ready.',
        TextDirection.ltr,
      );
    }
  }

  bool _expired(Quote? q) =>
      q?.expiresAt != null && q!.expiresAt!.isBefore(DateTime.now());

  Future<void> _accept() async {
    final data = _data!;
    final errand = data.errand;
    setState(() => _accepting = true);
    try {
      if (errand.status == ErrandStatus.quoted) {
        await _services.errands.transition(errand.id, ErrandStatus.accepted);
      }
      if (!mounted) return;
      setState(() => _accepting = false);
      await Nav.toCheckoutPayment(
        context,
        errand.id,
        route: isPositiveAmount(errand.budget) ? _route : null,
        method: _method,
      );
      if (mounted) _load();
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _accepting = false);
      if (e.statusCode == 409) {
        _load();
      } else {
        showSnack(context, "Couldn't accept the quote. Try again.");
      }
    }
  }

  Future<void> _cancel() async {
    final ok = await showNitumeConfirmDialog(
      context,
      title: 'Cancel this task?',
      body: 'Nothing has been charged yet.',
      confirmLabel: 'Cancel task',
      cancelLabel: 'Keep task',
    );
    if (!ok || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await _services.errands.transition(
        widget.errandId,
        ErrandStatus.cancelled,
      );
      if (!mounted) return;
      showSnack(context, 'Task cancelled.');
      Nav.resetTo(context, ShellTab.home);
    } on NitumeApiException {
      if (!mounted) return;
      setState(() => _cancelling = false);
      showSnack(context, "Couldn't cancel the task. Try again.");
    }
  }

  Future<void> _changeMethod() async {
    final picked = await Nav.selectPaymentMethod(
      context,
      selectedId: _method?.id,
    );
    if (picked != null && mounted) setState(() => _method = picked);
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final Widget body;
    Widget? cta;
    if (_error != null) {
      body = NitumeErrorState(
        message: "Couldn't load this task.",
        onRetry: _load,
      );
    } else if (data == null) {
      body = const SkeletonList();
    } else if (data.errand.status == ErrandStatus.requested) {
      body = _Waiting(
        errand: data.errand,
        cancelling: _cancelling,
        onCancel: _cancel,
      );
    } else {
      final expired = _expired(data.quote);
      body = _Checkout(
        data: data,
        route: _route,
        method: _method,
        onRoute: (r) => setState(() => _route = r),
        onChangeMethod: data.methods.isEmpty ? null : _changeMethod,
        onDecline: _cancelling ? null : _cancel,
      );
      cta = FixedCta(
        above: expired
            ? const NitumeNotice(message: 'This quote has expired.')
            : null,
        child: NitumeButton.primary(
          // The fee total is known only once the API records the payment
          // (fee mapping pending row 34), so the CTA carries no amount.
          label: 'Confirm & pay →',
          expand: true,
          loading: _accepting,
          onPressed: expired || _cancelling ? null : _accept,
        ),
      );
    }
    return PushedScaffold(
      title: 'Your quote',
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: KeyedSubtree(key: ValueKey(data?.errand.status), child: body),
      ),
      cta: cta,
    );
  }
}

class _Waiting extends StatelessWidget {
  const _Waiting({
    required this.errand,
    required this.cancelling,
    required this.onCancel,
  });

  final Errand errand;
  final bool cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 32),
        const Center(
          child: PulsingDots(semanticLabel: 'Waiting for your quote'),
        ),
        const SizedBox(height: 20),
        Text(
          'Preparing your quote',
          textAlign: TextAlign.center,
          style: NitumeTextStyles.dialogTitle.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 260),
            child: Text(
              "We're pricing your task. This usually takes a few minutes, "
              "and we'll notify you when it's ready.",
              textAlign: TextAlign.center,
              style: NitumeTextStyles.muted,
            ),
          ),
        ),
        const SizedBox(height: 22),
        TaskSummaryCard(errand: errand),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              NitumeButton.outline(
                label: 'Back to Home',
                onPressed: () => Nav.resetTo(context, ShellTab.home),
              ),
              const SizedBox(height: 10),
              NitumeButton.text(
                label: 'Cancel task',
                destructive: true,
                loading: cancelling,
                onPressed: onCancel,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Checkout extends StatelessWidget {
  const _Checkout({
    required this.data,
    required this.route,
    required this.method,
    required this.onRoute,
    required this.onChangeMethod,
    required this.onDecline,
  });

  final _QuoteData data;
  final MerchantRoute? route;
  final PaymentMethod? method;
  final ValueChanged<MerchantRoute> onRoute;
  final VoidCallback? onChangeMethod;
  final VoidCallback? onDecline;

  @override
  Widget build(BuildContext context) {
    final errand = data.errand;
    final quote = data.quote;
    final hasItem = isPositiveAmount(errand.budget);
    return ListView(
      children: [
        TaskSummaryCard(errand: errand),
        _FormCard(
          label: 'Final quote',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (quote != null)
                ...quoteRows(quote)
              else
                ReceiptRow(
                  label: 'Total',
                  amount: errand.quotedPrice,
                  isTotal: true,
                ),
              if (quote?.expiresAt != null)
                ReceiptCaption(
                  'Valid until ',
                  number: formatClock(quote!.expiresAt!),
                ),
            ],
          ),
        ),
        if (hasItem)
          _FormCard(
            label: 'How should this be paid?',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ReceiptRow(label: 'Item amount', amount: errand.budget),
                const Divider(height: 1, color: NitumeColors.slateLine),
                const SizedBox(height: 10),
                // Merchant details never exist on the errand yet (SQ-6), so
                // merchant-direct is shown disabled with the reason.
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
                  selected: route == MerchantRoute.sendToRunner,
                  onSelected: () => onRoute(MerchantRoute.sendToRunner),
                ),
              ],
            ),
          ),
        _FormCard(
          label: 'Pay with',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PaymentMethodCard(
                label: method?.label ?? PaymentMethodType.mpesa.label,
                detail:
                    method?.detail ??
                    (data.phone == null ? null : maskPhone(data.phone!)),
                trailing: onChangeMethod == null
                    ? null
                    : NitumeButton.link(
                        label: 'Change',
                        onPressed: onChangeMethod,
                      ),
              ),
              if (method == null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Your sign-in number',
                    style: NitumeTextStyles.mutedSmall,
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Center(
            child: NitumeButton.text(
              label: 'Decline and cancel task',
              destructive: true,
              onPressed: onDecline,
            ),
          ),
        ),
      ],
    );
  }
}

class _FormCard extends StatelessWidget {
  const _FormCard({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: NitumeFormCard(label: label, child: child),
    );
  }
}
