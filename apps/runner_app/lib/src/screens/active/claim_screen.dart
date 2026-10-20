import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';

/// `Claim item spend` copy (proposed, `v-job-summary.md` Data).
abstract final class ClaimCopy {
  static const title = 'Claim item spend';
  static const amount = 'Amount you spent';
  static const receipt = 'Receipt';
  static const addReceipt = 'Upload receipt';
  static const note = 'Anything we should know?';
  static const send = 'Send claim';
  static const amountInvalid = 'Enter the amount in KSh.';
  static const receiptRequired = 'Add the receipt for this task first.';
  static const noItem = "There's no item amount to reimburse on this task.";
  static const notAllowed =
      'Claims are only for tasks that ended before completion.';
  static const windowClosed =
      'The claim window has closed. Contact support with your receipt.';
  static String upTo(String cap) => 'Up to $cap.';
  static String overCap(String cap) => 'You can claim up to $cap.';
  static String receiptAt(String time) => 'Receipt, $time';

  /// A receipt without a capture time, by position (never its id).
  static String receiptNumber(int n) => 'Receipt $n';
  static const noteMax = 500;
}

/// Reimbursement claim after CANCELLED / FAILED (row 106): amount up to
/// min(item amount paid to Nitume, purchase limit) (rows 135, 142), the
/// runner's own receipt evidence, optional note. Pops `true` once sent.
class ClaimScreen extends StatefulWidget {
  const ClaimScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<ClaimScreen> createState() => _ClaimScreenState();
}

class _ClaimScreenState extends State<ClaimScreen> {
  late final AppServices _s = AppScope.read(context);
  final _amount = TextEditingController();
  final _note = TextEditingController();
  List<Evidence> _receipts = const [];
  String? _receiptId;
  bool _sending = false;
  String? _amountError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _note.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadReceipts());
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadReceipts() async {
    try {
      final ev = await _s.jobs.evidence(widget.errandId);
      final receipts = [
        for (final e in ev)
          if (e.type == EvidenceType.receipt) e,
      ];
      if (!mounted) return;
      setState(() {
        _receipts = receipts;
        _receiptId ??= receipts.isEmpty ? null : receipts.last.id;
      });
    } on Object {
      // The API answers receipt_required if none is on file.
    }
  }

  /// min(item amount, purchase limit); `null` when unknown.
  num? get _cap {
    final job = _s.active.byId(widget.errandId);
    final item = num.tryParse(job?.itemAmount ?? '');
    final limit = num.tryParse(job?.maxPurchaseAdvance ?? '');
    if (item == null) return limit;
    if (limit == null) return item;
    return item < limit ? item : limit;
  }

  Future<void> _send() async {
    final amount = int.tryParse(_amount.text.trim());
    final cap = _cap;
    setState(() {
      _error = null;
      _amountError = amount == null || amount < 1
          ? ClaimCopy.amountInvalid
          : (cap != null && amount > cap
                ? ClaimCopy.overCap(formatKes(cap))
                : null);
    });
    final receipt = _receiptId;
    if (_amountError != null || amount == null) return;
    if (receipt == null) {
      setState(() => _error = ClaimCopy.receiptRequired);
      return;
    }
    setState(() => _sending = true);
    try {
      await _s.payouts.claimReimbursement(
        errandId: widget.errandId,
        amount: amount,
        receiptEvidenceId: receipt,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      if (e is NitumeApiException &&
          e.code == ApiErrorCodes.reimbursementAlreadyRecorded) {
        // Back to the summary, which shows the existing line.
        Navigator.of(context).pop(true);
        return;
      }
      setState(() {
        _sending = false;
        _error = _message(e);
      });
    }
  }

  String _message(Object e) {
    if (e is NitumeApiException) {
      switch (e.code) {
        case ApiErrorCodes.receiptRequired:
          return ClaimCopy.receiptRequired;
        case ApiErrorCodes.reimbursementExceedsCap:
          final cap = e.details['cap'];
          return cap == null
              ? friendlyError(e)
              : ClaimCopy.overCap(formatKes('$cap'));
        case ApiErrorCodes.noItemAmountPaid:
          return ClaimCopy.noItem;
        case ApiErrorCodes.reimbursementClaimNotAllowed:
          return ClaimCopy.notAllowed;
        case ApiErrorCodes.reimbursementWindowClosed:
          return ClaimCopy.windowClosed;
      }
    }
    return friendlyError(e);
  }

  @override
  Widget build(BuildContext context) {
    final cap = _cap;
    final error = _error;
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: const NitumePushedHeader(title: ClaimCopy.title),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        children: [
          if (error != null) ...[
            NitumeNotice(message: error, tone: NitumeNoticeTone.danger),
            const SizedBox(height: 12),
          ],
          NitumeField.money(
            label: ClaimCopy.amount,
            controller: _amount,
            errorText: _amountError,
          ),
          if (cap != null) ...[
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'Up to '),
                  NumSpan(formatKes(cap)),
                  const TextSpan(text: '.'),
                ],
              ),
              style: NitumeTextStyles.mutedSmall,
            ),
          ],
          const SizedBox(height: 16),
          const SectionLabel(ClaimCopy.receipt, padding: EdgeInsets.zero),
          const SizedBox(height: 8),
          for (final (n, r) in _receipts.indexed) ...[
            // TODO(core-ui): the time in Fira Code once NitumeRadioRow takes
            // a rich label (feat/core-runner-evidence-store).
            NitumeRadioRow(
              label: r.capturedAt == null
                  ? ClaimCopy.receiptNumber(n + 1)
                  : ClaimCopy.receiptAt(
                      formatDayTimeEat(r.capturedAt!, now: _s.clock()),
                    ),
              selected: _receiptId == r.id,
              onSelected: () => setState(() => _receiptId = r.id),
            ),
            const SizedBox(height: 8),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: NitumeButton.secondary(
              label: ClaimCopy.addReceipt,
              size: NitumeButtonSize.small,
              onPressed: () async {
                await Nav.toEvidence(
                  context,
                  widget.errandId,
                  EvidenceType.receipt,
                );
                if (mounted) await _loadReceipts();
              },
            ),
          ),
          const SizedBox(height: 16),
          NitumeField(
            label: ClaimCopy.note,
            controller: _note,
            minLines: 2,
            maxLines: 4,
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
            inputFormatters: [
              LengthLimitingTextInputFormatter(ClaimCopy.noteMax),
            ],
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              formatCounter(_note.text.length, ClaimCopy.noteMax),
              key: const ValueKey('claim-note-counter'),
              style: NitumeTextStyles.meta,
            ),
          ),
        ],
      ),
      bottomNavigationBar: NitumeFixedCta(
        child: NitumeButton.primary(
          label: ClaimCopy.send,
          expand: true,
          loading: _sending,
          onPressed: _send,
        ),
      ),
    );
  }
}
