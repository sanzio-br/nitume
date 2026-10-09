import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/task_widgets.dart';

/// Codes answered with the already-answered state (409): decided by a
/// concurrent approve/reject, or the errand left IN_PROGRESS (row 49).
const _alreadyDecidedCodes = {
  ApiErrorCodes.priceChangeAlreadyDecided,
  ApiErrorCodes.priceChangeNotInProgress,
};

/// Approve answers that need the customer to choose the item route (row
/// 61): no item payment yet, or merchant-direct without details.
const _routeCodes = {
  ApiErrorCodes.merchantRouteRequired,
  ApiErrorCodes.merchantDetailsMissing,
};

/// What happened in the price-change modal.
enum PriceChangeOutcome { approved, rejected, dismissed }

class _Result {
  const _Result(this.outcome, [this.decision]);

  final PriceChangeOutcome outcome;
  final PriceChangeDecision? decision;
}

/// `v-price-auth`: blocking modal (OA-8, `barrierDismissible: false`).
/// Approve keeps the task (the customer pays the item difference); reject
/// cancels the task in the same API call.
///
/// After an approval the caller's screen gets the snackbar and, when the
/// difference has a merchant route, `x-merchant-payment`.
Future<PriceChangeOutcome> showPriceChangeDialog(
  BuildContext context, {
  required Errand errand,
  PriceChangeRequest? request,
}) async {
  final result = await NitumeDialog.show<_Result>(
    context,
    barrierDismissible: false,
    builder: (_) => _PriceChangeDialog(errand: errand, request: request),
  );
  final outcome = result?.outcome ?? PriceChangeOutcome.dismissed;
  if (!context.mounted) return outcome;
  if (outcome == PriceChangeOutcome.approved) {
    // A decrease may open an admin refund review (row 48); the refund
    // status itself shows on v-task-detail once the API returns it.
    final refund = result!.decision?.refundReview;
    showSnack(
      context,
      refund == null
          ? 'Price change approved.'
          : "Price change approved. We'll review a refund of the difference.",
    );
    final diff = result.decision?.differencePayment;
    if (diff?.merchantPayment != null) {
      await Nav.toMerchantPayment(
        context,
        errand.id,
        approvedIncrease: diff!.payment.merchantAmount,
        priceChangeRequestId: result.decision?.request.id,
      );
    }
  }
  return outcome;
}

class _PriceChangeDialog extends StatefulWidget {
  const _PriceChangeDialog({required this.errand, this.request});

  final Errand errand;
  final PriceChangeRequest? request;

  @override
  State<_PriceChangeDialog> createState() => _PriceChangeDialogState();
}

enum _Busy { none, approve, reject }

class _PriceChangeDialogState extends State<_PriceChangeDialog> {
  late final AppServices _services = context.services;
  PriceChangeRequest? _request;
  bool _loading = true;
  bool _answered = false;
  _Busy _busy = _Busy.none;
  String? _error;
  bool _loadFailed = false;

  /// Set when the API answered MERCHANT_ROUTE_REQUIRED: the customer must
  /// choose the item-amount route here (v-price-auth Q2 build default).
  bool _needsRoute = false;
  MerchantRoute? _route;

  @override
  void initState() {
    super.initState();
    _request = widget.request;
    // Requests exist only in IN_PROGRESS (row 49).
    if (widget.errand.status != ErrandStatus.inProgress) {
      _loading = false;
      _answered = true;
    } else if (_request != null) {
      _loading = false;
      _answered = !_request!.isPending;
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    try {
      final r = await _services.priceChanges.pending(widget.errand.id);
      if (!mounted) return;
      setState(() {
        _request = r;
        _answered = r == null;
        _loading = false;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadFailed = true;
      });
    }
  }

  Future<void> _approve() async {
    final r = _request!;
    setState(() {
      _busy = _Busy.approve;
      _error = null;
    });
    try {
      // The route is only sent once the customer chose it (OA-5); the app
      // never picks one for them.
      final decision = await _services.priceChanges.approve(
        widget.errand.id,
        r.id,
        merchantRoute: _route,
      );
      if (mounted) {
        Navigator.of(context)
            .pop(_Result(PriceChangeOutcome.approved, decision));
      }
    } on NitumeApiException catch (e) {
      if (_routeCodes.contains(e.code) && mounted) {
        setState(() {
          _busy = _Busy.none;
          _needsRoute = true;
        });
        return;
      }
      _failed(e);
    }
  }

  Future<void> _reject() async {
    final ok = await showNitumeConfirmDialog(
      context,
      title: 'Reject and cancel this task?',
      // Rows 37, 54: a reject opens an admin refund review.
      body:
          "The runner will stop work on this task. We'll review a refund of "
          "what you've paid, and you can follow it on the task.",
      confirmLabel: 'Reject & cancel',
      cancelLabel: 'Go back',
      barrierDismissible: false,
    );
    if (!ok || !mounted) return;
    setState(() {
      _busy = _Busy.reject;
      _error = null;
    });
    try {
      final d = await _services.priceChanges.reject(
        widget.errand.id,
        _request!.id,
      );
      if (mounted) {
        Navigator.of(context).pop(_Result(PriceChangeOutcome.rejected, d));
      }
    } on NitumeApiException catch (e) {
      _failed(e);
    }
  }

  void _failed(NitumeApiException e) {
    if (!mounted) return;
    setState(() {
      _busy = _Busy.none;
      // A concurrent decision won (409 price_change_already_decided), or
      // the request was otherwise already answered: show the spec's
      // already-answered state; closing it lets the caller refresh.
      if (_alreadyDecidedCodes.contains(e.code) ||
          (e.statusCode == 409 &&
              e.code != ApiErrorCodes.priceChangeRejectNotCancellable)) {
        _answered = true;
      } else {
        _error = "Couldn't send your answer. Try again.";
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loadFailed) {
      return NitumeDialog(
        title: 'Price change',
        body: "Couldn't load this price change.",
        actions: [
          NitumeButton.primary(label: 'Try again', onPressed: _load),
          NitumeButton.outline(
            label: 'Close',
            onPressed: () =>
                Navigator.of(context)
                    .pop(const _Result(PriceChangeOutcome.dismissed)),
          ),
        ],
      );
    }
    if (_loading) {
      return const NitumeDialog(
        title: 'Price change',
        content: Padding(
          padding: EdgeInsets.only(top: 8),
          child: SkeletonCard(),
        ),
      );
    }
    final r = _request;
    if (_answered || r == null) {
      return NitumeDialog(
        title: 'Price change',
        body: 'This price change was already answered.',
        actions: [
          NitumeButton.primary(
            label: 'OK',
            onPressed: () =>
                Navigator.of(context)
                    .pop(const _Result(PriceChangeOutcome.dismissed)),
          ),
        ],
      );
    }
    final diff = subtractDecimals(r.toPrice, r.fromPrice);
    final decrease = diff.startsWith('-');
    final change = decrease ? diff.substring(1) : diff;
    final name = runnerShortName(widget.errand.runner) ?? 'Your runner';
    final busy = _busy != _Busy.none;
    return NitumeDialog(
      title: 'Price change',
      body: decrease
          ? '$name found the item priced lower than quoted. Approve the new '
                'price to continue?'
          : '$name found the item priced higher than quoted. Approve the '
                'difference to continue?',
      error: _error,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (r.reason != null && r.reason!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '"${r.reason!.trim()}"',
                style: NitumeTextStyles.body.copyWith(fontSize: 13),
              ),
            ),
          _Compare(from: r.fromPrice, to: r.toPrice),
          Text(
            decrease
                ? '\u2212 ${formatKes(change)} less'
                : '${formatKes(change, signed: true)} additional',
            textAlign: TextAlign.center,
            style: NitumeTypography.numeric(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: NitumeDesignChoices.priceChangeAmount,
            ),
          ),
          if (_needsRoute) ...[
            const SizedBox(height: 16),
            Text(
              'How should this be paid?'.toUpperCase(),
              style: NitumeTextStyles.cardLabel,
            ),
            const SizedBox(height: 8),
            MerchantRouteRows(
              selected: _route,
              enabled: !busy,
              merchantDetailsAvailable:
                  widget.errand.merchantDetailsAvailable == true,
              onSelected: (r) => setState(() => _route = r),
            ),
          ],
        ],
      ),
      actions: [
        NitumeButton.primary(
          label: decrease
              ? 'Approve new price'
              : 'Approve ${formatKes(change)} increase',
          richLabel: decrease
              ? null
              : TextSpan(
                  children: [
                    const TextSpan(text: 'Approve '),
                    NumSpan.kes(change),
                    const TextSpan(text: ' increase'),
                  ],
                ),
          loading: _busy == _Busy.approve,
          onPressed: busy || (_needsRoute && _route == null) ? null : _approve,
        ),
        NitumeButton.outline(
          label: 'Reject & cancel task',
          destructive: true,
          loading: _busy == _Busy.reject,
          onPressed: busy ? null : _reject,
        ),
      ],
    );
  }
}

/// `Original 40,000 → New price 45,000` between hairlines.
class _Compare extends StatelessWidget {
  const _Compare({required this.from, required this.to});

  final String from;
  final String to;

  @override
  Widget build(BuildContext context) {
    Widget column(String label, String value, Color color) => Expanded(
      child: Column(
        children: [
          Text(
            label,
            style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 11),
          ),
          const SizedBox(height: 4),
          NumText(
            formatAmount(value),
            fontSize: 19,
            color: color,
            semanticsLabel: '$label ${formatKes(value)}',
          ),
        ],
      ),
    );
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 14),
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: const BoxDecoration(
        border: Border.symmetric(
          horizontal: BorderSide(color: NitumeColors.slateLine),
        ),
      ),
      child: Row(
        children: [
          column('Original', from, NitumeColors.blue),
          ExcludeSemantics(
            child: Text(
              '→',
              style: NitumeTextStyles.body.copyWith(
                color: NitumeColors.slate400,
              ),
            ),
          ),
          column('New price', to, NitumeDesignChoices.priceChangeAmount),
        ],
      ),
    );
  }
}
