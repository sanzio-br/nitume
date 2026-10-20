import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/live_updates.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/deadline_widgets.dart';
import '../../widgets/task_widgets.dart';
import 'deadline_sheet.dart';

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
  const AwaitingQuoteScreen({
    super.key,
    required this.errandId,
    this.quoteExpired = false,
    this.deadlinePassed = false,
  });

  final String errandId;

  /// Opened because the API answered `quote_expired` (row 46).
  final bool quoteExpired;

  /// Opened because payment was refused with
  /// `deadline_passed_before_payment` (row 237).
  final bool deadlinePassed;

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
  late bool _expiredByApi = widget.quoteExpired;

  /// Payment refused because the chosen deadline passed (row 237); cleared
  /// once the deadline changes.
  late bool _deadlinePassedByApi = widget.deadlinePassed;
  bool _changingDeadline = false;
  ErrandWatch? _watch;

  @override
  void initState() {
    super.initState();
    _load();
    // Fallback only while the socket is down (§10): picks up the quote and
    // merchant details as they arrive.
    _poller = Poller(
      interval: const Duration(seconds: 15),
      enabled: _services.pollingEnabled,
      isVisible: () =>
          mounted && isRouteVisible(context) && !_services.live.isConnected,
      onTick: _refreshErrand,
    );
    _watch = _services.live.watch(
      widget.errandId,
      onStatus: (_) => _refreshErrand(),
      // A re-quote (row 72) or new merchant details (row 43) change the
      // checkout without a status change.
      onQuoteReissued: (_) => _refreshErrand(force: true),
      onMerchantDetails: (_) => _refreshErrand(force: true),
      // The customer's own request, possibly from another device.
      onQuoteRequested: (_) => _refreshErrand(force: true),
      onReconnected: _refreshErrand,
    );
  }

  @override
  void dispose() {
    _poller?.dispose();
    _watch?.cancel();
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
    // Merchant-direct when available, else send-to-runner (spec default).
    _route ??= errand.merchantDetailsAvailable == true
        ? MerchantRoute.merchantDirect
        : MerchantRoute.sendToRunner;
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

  Future<void> _refreshErrand({bool force = false}) async {
    final errand = await _services.errands.get(widget.errandId);
    if (!mounted || _routeAway(errand)) return;
    final old = _data;
    final was = old?.errand.status;
    final changed =
        old?.errand.merchantDetailsAvailable !=
            errand.merchantDetailsAvailable ||
        old?.errand.quoteRequestedAt != errand.quoteRequestedAt ||
        old?.errand.quoteExpiresAt != errand.quoteExpiresAt ||
        old?.errand.deadlineAt != errand.deadlineAt ||
        old?.errand.outsideServiceArea != errand.outsideServiceArea;
    if (was == errand.status && !changed && !force) return;
    // A new deadline (possibly set on another device) ends the refusal.
    if (old != null && old.errand.deadlineAt != errand.deadlineAt) {
      _deadlinePassedByApi = false;
    }
    final wasRequested = old != null && _newQuoteRequested(old);
    final data = await _checkoutData(errand);
    if (!mounted) return;
    // A fresh quote clears the expired state.
    if (was == ErrandStatus.requested || force || wasRequested) {
      _expiredByApi = false;
    }
    setState(() => _data = data);
    final String? announce;
    if (was == ErrandStatus.requested && errand.status == ErrandStatus.quoted) {
      announce = 'Your quote is ready.';
    } else if (wasRequested && !_newQuoteRequested(data)) {
      announce = 'Your new quote is ready.';
    } else {
      announce = null;
    }
    if (announce != null) {
      SemanticsService.sendAnnouncement(
        View.of(context),
        announce,
        TextDirection.ltr,
      );
    }
  }

  /// Row 68: the customer asked for a new quote and none has arrived yet
  /// (`quoteRequestedAt` later than the newest quote).
  static bool _newQuoteRequested(_QuoteData d) {
    final e = d.errand;
    if (e.status != ErrandStatus.quoted && e.status != ErrandStatus.accepted) {
      return false;
    }
    final at = e.quoteRequestedAt;
    if (at == null) return false;
    final quoted = d.quote?.createdAt;
    return quoted == null || at.isAfter(quoted);
  }

  bool _requestingQuote = false;

  /// `Request a new quote` (row 68).
  Future<void> _requestNewQuote() async {
    setState(() => _requestingQuote = true);
    try {
      await _services.errands.requestNewQuote(widget.errandId);
      if (!mounted) return;
      setState(() => _requestingQuote = false);
      showSnack(context, "We've asked for a new quote.");
      await _load();
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _requestingQuote = false);
      if (e.code == ApiErrorCodes.quoteStillValid) {
        // The clock was wrong or an admin re-quoted meanwhile.
        _expiredByApi = false;
        await _load();
      } else if (e.code == ApiErrorCodes.quoteRequestNotAllowed) {
        await _load();
      } else {
        showSnack(context, "Couldn't request a new quote. Try again.");
      }
    }
  }

  /// The fee total (row 34): the errand's `feeTotal`, else the quote total.
  static String? _feeTotal(_QuoteData d) =>
      d.errand.feeTotal ?? d.quote?.total ?? d.errand.quotedPrice;

  /// What the STK charges: the fee total, plus the item amount for
  /// `send_to_runner` (one combined STK, row 76).
  String? _total(_QuoteData d) {
    final fee = _feeTotal(d);
    if (fee == null) return null;
    final item = d.errand.budget;
    if (_route == MerchantRoute.sendToRunner && isPositiveAmount(item)) {
      return addDecimals(fee, item);
    }
    return fee;
  }

  String _ctaLabel(_QuoteData d) {
    final total = _total(d);
    return total == null
        ? 'Confirm & pay →'
        : 'Confirm & pay ${formatKes(total)} →';
  }

  /// Same wording with the amount in Fira Code (C-32).
  InlineSpan? _ctaRichLabel(_QuoteData d) {
    final total = _total(d);
    if (total == null) return null;
    return TextSpan(
      children: [
        const TextSpan(text: 'Confirm & pay '),
        NumSpan.kes(total),
        const TextSpan(text: ' →'),
      ],
    );
  }

  bool _expired(_QuoteData d) {
    if (d.errand.status != ErrandStatus.quoted &&
        d.errand.status != ErrandStatus.accepted) {
      return false;
    }
    final at = d.errand.quoteExpiresAt ?? d.quote?.expiresAt;
    return _expiredByApi || (at != null && at.isBefore(DateTime.now()));
  }

  /// Row 236 (C-14-2): the API flags the task as inside no service area
  /// (`outsideServiceArea`, sent only by `GET /errands/:id`, which every
  /// load and refresh here uses). Row 249 (b): shown only for REQUESTED, or
  /// QUOTED / ACCEPTED once the quote has expired; a still-valid quote can be
  /// paid, so a stale flag never tells the customer to cancel it.
  bool _outsideArea(_QuoteData d) =>
      d.errand.outsideServiceArea &&
      (d.errand.status == ErrandStatus.requested || _expired(d));

  /// Row 237: a deadline the customer chose has passed before payment (a
  /// non-null `deadlineAt` before payment is always theirs, rows 239, 240),
  /// or the API refused payment for it.
  bool _deadlinePassed(_QuoteData d) =>
      d.errand.status.isBeforePayment &&
      (_deadlinePassedByApi ||
          d.errand.deadlinePassedBeforePayment(DateTime.now()));

  /// `Choose a new deadline` / `Change` (rows 237, 242–244): the quote is
  /// kept; the checkout shows the new deadline in place.
  Future<void> _chooseDeadline() async {
    final data = _data;
    if (data == null || _changingDeadline) return;
    final result = await showDeadlineSheet(context, errand: data.errand);
    if (!mounted) return;
    switch (result) {
      case DeadlineSaved(:final errand):
        setState(() => _changingDeadline = true);
        // The full errand view (route flags, quote expiry) comes from GET.
        final fresh = await _services.errands
            .get(errand.id)
            .then<Errand?>((e) => e, onError: (Object _) => null);
        if (!mounted) return;
        final next = fresh ?? errand;
        if (_routeAway(next)) return;
        final current = _data ?? data;
        setState(() {
          _changingDeadline = false;
          _deadlinePassedByApi = false;
          _data = _QuoteData(
            errand: next,
            quote: current.quote,
            methods: current.methods,
            phone: current.phone,
          );
        });
      case DeadlineReload():
        // Paid meanwhile (`deadline_not_editable`): route per Entry.
        await _load();
      case null:
        return;
    }
  }

  Future<void> _accept() async {
    final data = _data!;
    final errand = data.errand;
    setState(() => _accepting = true);
    try {
      // QUOTED → ACCEPTED, or accept an admin re-quote while ACCEPTED
      // (payment requires the newest quote accepted, row 72).
      if (errand.status == ErrandStatus.quoted ||
          errand.quoteAcceptanceRequired) {
        await _services.errands.acceptQuote(
          errand.id,
          fallbackToTransition: true,
        );
      }
      if (!mounted) return;
      setState(() => _accepting = false);
      final exit = await Nav.toCheckoutPayment(
        context,
        errand.id,
        route: isPositiveAmount(errand.budget) ? _route : null,
        method: _method,
      );
      if (!mounted) return;
      // Row 237: payment refused, back here in the new-deadline state.
      if (exit == PaymentExit.deadlinePassed) _deadlinePassedByApi = true;
      _load();
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _accepting = false);
      if (e.code == ApiErrorCodes.quoteExpired) {
        setState(() => _expiredByApi = true);
      } else if (e.statusCode == 409) {
        // quote_not_acceptable (ApiErrorCodes.quoteNotAcceptable) or another
        // state change: route per Entry.
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
    } else if (_outsideArea(data)) {
      // Row 236: refused at quote; the customer may cancel (nothing paid).
      body = _Waiting(
        errand: data.errand,
        outsideArea: true,
        cancelling: _cancelling,
        onCancel: _cancel,
      );
    } else if (data.errand.status == ErrandStatus.requested) {
      body = _Waiting(
        errand: data.errand,
        cancelling: _cancelling,
        onCancel: _cancel,
      );
    } else if (_newQuoteRequested(data)) {
      body = _Waiting(
        errand: data.errand,
        requestedAt: data.errand.quoteRequestedAt,
        cancelling: _cancelling,
        onCancel: _cancel,
      );
    } else {
      final expired = _expired(data);
      // An expired quote is answered first (a new quote is needed anyway);
      // then the passed deadline (row 237).
      final deadlinePassed = !expired && _deadlinePassed(data);
      body = _Checkout(
        data: data,
        expired: expired,
        deadlinePassed: deadlinePassed,
        onChangeDeadline: deadlinePassed || _cancelling || _accepting
            ? null
            : _chooseDeadline,
        route: _route,
        method: _method,
        onRoute: (r) => setState(() => _route = r),
        onChangeMethod: data.methods.isEmpty ? null : _changeMethod,
        onDecline: _cancelling ? null : _cancel,
      );
      // Expired (rows 46, 68): ask for a new quote.
      cta = expired
          ? FixedCta(
              child: NitumeButton.primary(
                label: 'Request a new quote',
                expand: true,
                loading: _requestingQuote,
                onPressed: _cancelling ? null : _requestNewQuote,
              ),
            )
          : deadlinePassed
          ? FixedCta(
              child: NitumeButton.primary(
                label: 'Choose a new deadline',
                expand: true,
                loading: _changingDeadline,
                onPressed: _cancelling ? null : _chooseDeadline,
              ),
            )
          : FixedCta(
              child: NitumeButton.primary(
                label: _ctaLabel(data),
                richLabel: _ctaRichLabel(data),
                expand: true,
                loading: _accepting,
                onPressed: _cancelling || _changingDeadline ? null : _accept,
              ),
            );
    }
    return PushedScaffold(
      title: 'Your quote',
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: KeyedSubtree(
          key: ValueKey((
            data?.errand.status,
            data != null && _newQuoteRequested(data),
            data != null && _outsideArea(data),
          )),
          child: body,
        ),
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
    this.requestedAt,
    this.outsideArea = false,
  });

  final Errand errand;

  /// Row 236: `We can't take this task`, `Cancel task` as the primary.
  final bool outsideArea;

  /// Set for the "New quote requested" variant (row 68).
  final DateTime? requestedAt;
  final bool cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final again = requestedAt != null && !outsideArea;
    final String heading;
    final String body;
    if (outsideArea) {
      // Owner copy, row 241 (same words as the notification).
      heading = "We can't take this task";
      body =
          'Its location is outside the areas we serve. You can cancel it; '
          "you haven't paid anything.";
    } else if (again) {
      heading = 'Preparing a new quote';
      body = "You asked for a new quote. We'll notify you when it's ready.";
    } else {
      heading = 'Preparing your quote';
      body =
          "We're pricing your task. This usually takes a few minutes, and "
          "we'll notify you when it's ready.";
    }
    final cancel = outsideArea
        ? NitumeButton.primary(
            label: 'Cancel task',
            loading: cancelling,
            onPressed: onCancel,
          )
        : NitumeButton.text(
            label: 'Cancel task',
            destructive: true,
            loading: cancelling,
            onPressed: onCancel,
          );
    final home = NitumeButton.outline(
      label: 'Back to Home',
      onPressed: () => Nav.resetTo(context, ShellTab.home),
    );
    return ListView(
      children: [
        const SizedBox(height: 32),
        // Nothing is being prepared for a refused task: no waiting dots.
        if (!outsideArea) ...[
          Center(
            child: PulsingDots(
              semanticLabel: again
                  ? 'Waiting for your new quote'
                  : 'Waiting for your quote',
            ),
          ),
          const SizedBox(height: 20),
        ],
        Semantics(
          liveRegion: outsideArea,
          child: Text(
            heading,
            textAlign: TextAlign.center,
            style: NitumeTextStyles.dialogTitle.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 260),
            child: Text(
              body,
              textAlign: TextAlign.center,
              style: NitumeTextStyles.muted,
            ),
          ),
        ),
        if (again) ...[
          const SizedBox(height: 6),
          Text(
            'Requested ${formatDayTime(requestedAt!)}',
            textAlign: TextAlign.center,
            style: NitumeTextStyles.metaLarge,
          ),
        ],
        const SizedBox(height: 22),
        // No chip while a new quote is requested, nor on a refused QUOTED /
        // ACCEPTED task (`Quote ready` / `Awaiting payment` would no longer
        // be true; the UI never invents a label).
        TaskSummaryCard(
          errand: errand,
          showChip:
              !again &&
              (!outsideArea || errand.status == ErrandStatus.requested),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: outsideArea
                ? [cancel, const SizedBox(height: 10), home]
                : [home, const SizedBox(height: 10), cancel],
          ),
        ),
      ],
    );
  }
}

class _Checkout extends StatelessWidget {
  const _Checkout({
    required this.data,
    required this.expired,
    required this.deadlinePassed,
    required this.onChangeDeadline,
    required this.route,
    required this.method,
    required this.onRoute,
    required this.onChangeMethod,
    required this.onDecline,
  });

  final _QuoteData data;
  final bool expired;

  /// Row 237: the notice replaces the pay CTA's purpose.
  final bool deadlinePassed;

  /// `Change` on the `Deadline` line; `null` hides it.
  final VoidCallback? onChangeDeadline;
  final MerchantRoute? route;
  final PaymentMethod? method;
  final ValueChanged<MerchantRoute> onRoute;
  final VoidCallback? onChangeMethod;
  final VoidCallback? onDecline;

  @override
  Widget build(BuildContext context) {
    final errand = data.errand;
    final quote = data.quote;
    final hasItem = isPositiveAmount(errand.budget) && !expired;
    final expiresAt = quote?.expiresAt;
    return ListView(
      children: [
        // Expired: no chip (it would read "Quote ready", no longer true).
        TaskSummaryCard(
          errand: errand,
          showChip: !expired,
          footer: DeadlineLine(errand: errand, onChange: onChangeDeadline),
        ),
        _FormCard(
          label: 'Final quote',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // OA-4: only Service fee + Runner fee + their total are shown.
              // The API returns neither fee yet (row 34), so only the
              // total row is rendered; internal quote parts never are.
              ReceiptRow(
                label: kFeeTotalLabel,
                amount: errand.feeTotal ?? quote?.total ?? errand.quotedPrice,
                isTotal: true,
              ),
              if (expiresAt != null)
                ReceiptCaption(
                  expired ? 'Expired at ' : 'Valid until ',
                  number: formatClock(expiresAt),
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
                MerchantRouteRows(
                  selected: route,
                  onSelected: onRoute,
                  merchantDetailsAvailable:
                      errand.merchantDetailsAvailable == true,
                ),
              ],
            ),
          ),
        if (expired)
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
            // Row 68: the CTA below asks for a new quote.
            child: NitumeNotice(
              message:
                  'This quote has expired. Ask for a new quote to continue.',
            ),
          ),
        if (deadlinePassed)
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
            // Row 237: the CTA below opens the new-deadline sheet.
            child: NitumeNotice(
              message:
                  'Your deadline has passed. Choose a new one to continue.',
            ),
          ),
        if (!expired)
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
