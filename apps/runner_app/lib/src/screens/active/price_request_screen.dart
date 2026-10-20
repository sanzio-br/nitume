import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/active_jobs.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import 'active_presentation.dart';

/// `v-price-request` copy (mockup copy where the spec says so, the rest
/// proposed).
abstract final class PriceCopy {
  static const title = 'Request price change';
  static const original = 'Original authorization';
  static const newPrice = 'New price at the shop';
  static const reason = 'Reason';
  static const reasonHint =
      'e.g. The model you chose is out of stock; the newer one costs more.';
  static const send = 'Send to customer for approval';
  static const notInProgress =
      'Price changes are only possible while the task is in progress.';
  static const alreadyPending =
      "There's already a request waiting for the customer.";
  static const notApplicable = "Price changes aren't available for this task.";
  static const priceInvalid = 'Enter the new price in KSh.';
  static const priceSame = 'Enter a price different from the original.';
  static const reasonInvalid = 'Tell the customer why the price changed.';
  static const confirmTitle = 'Send this price change?';
  static const confirm = 'Send';
  static const back = 'Back';
  static const discardTitle = 'Discard this request?';
  static const discardBody = 'What you entered will be lost.';
  static const discard = 'Discard';
  static const keepEditing = 'Keep editing';
}

/// `v-price-request`: the runner asks the customer to approve a new item
/// amount (IN_PROGRESS, Buy For Me / Get It For Me only; rows 37, 49, 55,
/// 101). The item amount only, never a fee. Pops `true` once sent.
class PriceRequestScreen extends StatefulWidget {
  const PriceRequestScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<PriceRequestScreen> createState() => _PriceRequestScreenState();
}

class _PriceRequestScreenState extends State<PriceRequestScreen> {
  final _price = TextEditingController();
  final _reason = TextEditingController();
  late final AppServices _s = AppScope.read(context);
  bool _loading = true;
  bool _pending = false;
  bool _sending = false;
  String? _priceError;
  String? _reasonError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _price.addListener(_rebuild);
    _reason.addListener(_rebuild);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _rebuild() => setState(() {});

  @override
  void dispose() {
    _price.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await _s.jobs.pendingPriceChange(widget.errandId);
      if (mounted) setState(() => _pending = p != null);
    } on Object {
      // The API refuses a second request anyway.
    }
    if (mounted) setState(() => _loading = false);
  }

  RunnerJobView? get _job => _s.active.byId(widget.errandId);

  num? get _newPrice {
    final v = int.tryParse(_price.text.trim());
    return v == null || v < 1 || v > 10000000 ? null : v;
  }

  bool get _dirty => _price.text.isNotEmpty || _reason.text.isNotEmpty;

  Future<void> _submit(RunnerJobView job) async {
    final original = num.tryParse(job.itemAmount ?? '');
    final price = _newPrice;
    final reason = _reason.text.trim();
    setState(() {
      _priceError = price == null
          ? PriceCopy.priceInvalid
          : (original != null && price == original
                ? PriceCopy.priceSame
                : null);
      _reasonError = reason.length < 10 || reason.length > 500
          ? PriceCopy.reasonInvalid
          : null;
      _error = null;
    });
    if (_priceError != null || _reasonError != null || price == null) return;
    final from = formatKes(job.itemAmount ?? '0');
    final to = formatKes(price);
    const tail = '. The customer must approve it before you buy.';
    final ok = await NitumeDialog.show<bool>(
      context,
      builder: (ctx) => NitumeDialog(
        title: PriceCopy.confirmTitle,
        content: Text.rich(
          TextSpan(
            children: [
              NumSpan(from),
              const TextSpan(text: ' → '),
              NumSpan(to),
              const TextSpan(text: tail),
            ],
          ),
          semanticsLabel: '$from → $to$tail',
          style: NitumeTextStyles.muted,
        ),
        actions: [
          NitumeButton.outline(
            label: PriceCopy.confirm,
            onPressed: () => Navigator.of(ctx).pop(true),
          ),
          NitumeButton.primary(
            label: PriceCopy.back,
            onPressed: () => Navigator.of(ctx).pop(false),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _sending = true);
    try {
      await _s.jobs.requestPriceChange(
        widget.errandId,
        toPrice: price,
        reason: reason,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = _message(e);
      });
    }
  }

  String _message(Object e) {
    if (e is NitumeApiException) {
      switch (e.code) {
        case ApiErrorCodes.priceChangeAlreadyPending:
          return PriceCopy.alreadyPending;
        case ApiErrorCodes.merchantAmountNotApplicable:
          return PriceCopy.notApplicable;
        case ApiErrorCodes.priceChangeNotInProgress ||
            ApiErrorCodes.priceChangeNotAllowed:
          return PriceCopy.notInProgress;
      }
      if (e.statusCode == 403) {
        _s.active.load();
        return ActiveJobsCopy.revoked;
      }
    }
    return friendlyError(e);
  }

  Future<void> _leave() async {
    if (!_dirty) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showNitumeConfirmDialog(
      context,
      title: PriceCopy.discardTitle,
      body: PriceCopy.discardBody,
      confirmLabel: PriceCopy.discard,
      cancelLabel: PriceCopy.keepEditing,
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  Widget? _difference(RunnerJobView job) {
    final original = num.tryParse(job.itemAmount ?? '');
    final price = _newPrice;
    if (original == null || price == null || price == original) return null;
    final diff = formatKes((price - original).abs());
    final word = price > original ? 'more' : 'less';
    return Text.rich(
      TextSpan(
        children: [
          const TextSpan(text: 'The customer will be asked to approve '),
          NumSpan(diff),
          TextSpan(text: ' $word.'),
        ],
      ),
      key: const ValueKey('price-difference'),
      style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
    );
  }

  Widget? _limitNote(RunnerJobView job) {
    final price = _newPrice;
    final limit = num.tryParse(job.maxPurchaseAdvance);
    if (job.merchantRoute != MerchantRoute.sendToRunner ||
        price == null ||
        limit == null ||
        price <= limit) {
      return null;
    }
    final l = formatKes(limit);
    return NitumeNotice(
      message:
          "This is above your purchase limit of $l. You'll be reimbursed up "
          'to $l unless our team approves more.',
      richMessage: TextSpan(
        children: [
          const TextSpan(text: 'This is above your purchase limit of '),
          NumSpan(l),
          const TextSpan(text: ". You'll be reimbursed up to "),
          NumSpan(l),
          const TextSpan(text: ' unless our team approves more.'),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    final status = job == null ? null : _s.active.statusOf(job);
    final Widget body;
    String? blocked;
    if (job == null || status == null || !canRequestPrice(job, status)) {
      blocked = PriceCopy.notInProgress;
    } else if (_pending) {
      blocked = PriceCopy.alreadyPending;
    }
    if (_loading) {
      body = const Padding(
        padding: EdgeInsets.all(20),
        child: SkeletonCard(height: 240),
      );
    } else if (blocked != null) {
      body = Padding(
        padding: const EdgeInsets.all(20),
        child: NitumeNotice(message: blocked),
      );
    } else {
      final j = job!;
      final diff = _difference(j);
      final limit = _limitNote(j);
      final error = _error;
      body = ListView(
        padding: const EdgeInsets.only(bottom: 16),
        children: [
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              child: NitumeNotice(
                message: error,
                tone: NitumeNoticeTone.danger,
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: NitumeCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionLabel(
                    PriceCopy.original,
                    padding: EdgeInsets.only(bottom: 8),
                  ),
                  NumText.kes(j.itemAmount ?? '0', fontSize: 22),
                  const SizedBox(height: 16),
                  const SectionLabel(
                    PriceCopy.newPrice,
                    padding: EdgeInsets.only(bottom: 8),
                  ),
                  Semantics(
                    label: PriceCopy.newPrice,
                    child: NitumeField.money(
                      controller: _price,
                      errorText: _priceError,
                    ),
                  ),
                  if (diff != null) ...[const SizedBox(height: 8), diff],
                  const SizedBox(height: 14),
                  const SectionLabel(
                    PriceCopy.reason,
                    padding: EdgeInsets.only(bottom: 8),
                  ),
                  Semantics(
                    label: PriceCopy.reason,
                    child: NitumeField(
                      controller: _reason,
                      hint: PriceCopy.reasonHint,
                      minLines: 3,
                      maxLines: 5,
                      keyboardType: TextInputType.multiline,
                      textInputAction: TextInputAction.newline,
                      errorText: _reasonError,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      formatCounter(_reason.text.trim().length, 500),
                      style: NitumeTextStyles.meta,
                    ),
                  ),
                  if (limit != null) ...[const SizedBox(height: 12), limit],
                ],
              ),
            ),
          ),
        ],
      );
    }
    return PopScope(
      canPop: !_dirty || _sending,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        backgroundColor: NitumeColors.slate,
        appBar: NitumePushedHeader(title: PriceCopy.title, onBack: _leave),
        body: body,
        bottomNavigationBar: blocked != null || _loading
            ? null
            : NitumeFixedCta(
                child: NitumeButton.primary(
                  label: PriceCopy.send,
                  expand: true,
                  loading: _sending,
                  onPressed: () => _submit(job!),
                ),
              ),
      ),
    );
  }
}
