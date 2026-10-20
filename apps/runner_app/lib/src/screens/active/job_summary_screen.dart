import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/active_jobs.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../jobs/offer_presentation.dart';
import 'active_presentation.dart';

/// `v-job-summary` copy (mockup copy where the spec says so, the rest
/// proposed).
abstract final class SummaryCopy {
  static const title = 'Job complete';
  static const runnerFee = 'Runner fee';
  static const youllEarn = "You'll earn";
  static const youEarned = 'You earned';
  static const itemReimbursement = 'Item reimbursement';
  static const reimbursementNote =
      'Paid with your runner fee once the customer confirms and the review '
      'window closes. Not part of your earnings.';
  static const onHold = 'On hold';
  static const onHoldNote =
      "Our team will check your purchase before it's paid.";
  static const notApproved = 'Not approved';
  static const notApprovedNote =
      "Our team didn't approve this reimbursement. Contact support if you "
      'think this is wrong.';
  static const backToJobs = 'Back to jobs';
  static const claim = 'Claim item spend';
  static const claimClosed =
      'The claim window has closed. Contact support with your receipt.';
  static const contactSupport = 'Contact support';
  static const ended =
      "This task ended before completion, so there's no runner fee.";
  static const endedReimburse =
      "If you already bought the item, we'll review your receipt and "
      'reimburse what you spent.';
  static const claimSent = 'Claim sent. Our team will check your receipt.';
  static const loadError = "Couldn't load this job.";

  /// Heading on CANCELLED / FAILED (SA-2, proposed).
  static const endedHeading = 'Job ended';

  static String heading(String? displayName) {
    final first = displayName?.trim().split(RegExp(r'\s+')).first ?? '';
    return first.isEmpty ? 'Nice work.' : 'Nice work, $first.';
  }

  /// Sub line status part.
  static String statusLine(ErrandStatus s) => switch (s) {
    ErrandStatus.awaitingCustomer => 'awaiting customer confirmation',
    _ => (runnerStatusPresentation(s)?.label ?? '').toLowerCase(),
  };

  static String payable(ErrandStatus s) => switch (s) {
    ErrandStatus.awaitingCustomer =>
      'Payable after the customer confirms and the review window closes.',
    ErrandStatus.completed =>
      'The customer confirmed. Payable when the review window closes.',
    ErrandStatus.confirmed => "Payable now. It's in your available balance.",
    ErrandStatus.settled => 'Paid to your M-Pesa.',
    ErrandStatus.disputed =>
      "Our team is reviewing the customer's report. If it's decided in your "
          "favour, you're paid as normal.",
    _ => '',
  };
}

/// `v-job-summary`: what the runner earns for the job and, on purchase
/// tasks, the item reimbursement, with when each becomes payable (rows 95,
/// 104–107, 119, 140, 143). Never the customer's payment or refund.
class JobSummaryScreen extends StatefulWidget {
  const JobSummaryScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<JobSummaryScreen> createState() => _JobSummaryScreenState();
}

class _JobSummaryScreenState extends State<JobSummaryScreen> {
  late final AppServices _s = AppScope.read(context);
  RunnerJobView? _job;
  JobDetails _details = const JobDetails();
  List<PayoutFeedItem> _lines = const [];
  bool _loading = true;
  Object? _error;
  bool _revoked = false;

  @override
  void initState() {
    super.initState();
    _job = _s.active.byId(widget.errandId);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final read = await _s.jobs.readJob(widget.errandId);
      if (read is RunnerJobAccessRevoked) {
        _s.active.revoke(widget.errandId);
        if (mounted) setState(() => _revoked = true);
        return;
      }
      final job = (read as RunnerJobAvailable).job;
      final results = await Future.wait<Object?>([
        _s.jobs.evidence(widget.errandId).catchError((_) => <Evidence>[]),
        _s.jobs
            .history(widget.errandId)
            .catchError((_) => <StatusHistoryEntry>[]),
        _s.payouts
            .payoutLines(errandId: widget.errandId)
            .then<Object?>((p) => p.items)
            .catchError((_) => <PayoutFeedItem>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _job = job;
        _details = JobDetails(
          evidence: results[0]! as List<Evidence>,
          history: results[1]! as List<StatusHistoryEntry>,
        );
        _lines = results[2]! as List<PayoutFeedItem>;
        _error = null;
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _backToJobs() {
    _s.shell.select(RunnerTab.jobs);
    Nav.popToRoot(context);
  }

  PayoutFeedItem? _line(PayoutFeedKind kind) {
    for (final l in _lines) {
      if (l.kind == kind) return l;
    }
    return null;
  }

  Future<void> _claim() async {
    final sent = await Nav.toClaim(context, widget.errandId);
    if (sent == true && mounted) {
      showSnack(context, SummaryCopy.claimSent);
      await _load();
    }
  }

  Widget _endedBody(RunnerJobView job, ErrandStatus status) {
    final style = NitumeTextStyles.muted.copyWith(fontSize: 12.5);
    final reimbursement = _line(PayoutFeedKind.itemReimbursement);
    final endsAt = _details.endedAt?.add(RunnerJobsRepository.endedJobWindow);
    final open = endsAt == null || _s.clock().isBefore(endsAt);
    final support = _s.appConfig.supportLink;
    return Column(
      children: [
        Text(SummaryCopy.ended, textAlign: TextAlign.center, style: style),
        if (needsReceipt(job)) ...[
          const SizedBox(height: 6),
          Text(
            SummaryCopy.endedReimburse,
            textAlign: TextAlign.center,
            style: style,
          ),
          const SizedBox(height: 14),
          if (reimbursement != null)
            _reimbursementCard(reimbursement.amount, reimbursement.status)
          else if (open)
            NitumeButton.secondary(label: SummaryCopy.claim, onPressed: _claim)
          else ...[
            Text(
              SummaryCopy.claimClosed,
              textAlign: TextAlign.center,
              style: style,
            ),
            if (support != null)
              NitumeButton.link(
                label: SummaryCopy.contactSupport,
                onPressed: () => _s.appConfig.open(support),
              ),
          ],
        ],
      ],
    );
  }

  Widget _reimbursementCard(String amount, PayoutLineStatus? status) {
    return ReceiptCard(
      rows: [ReceiptRow(label: SummaryCopy.itemReimbursement, amount: amount)],
      caption: switch (status) {
        PayoutLineStatus.onHold => const ReceiptCaption(SummaryCopy.onHoldNote),
        PayoutLineStatus.rejected => const ReceiptCaption(
          SummaryCopy.notApprovedNote,
        ),
        _ => null,
      },
    );
  }

  Widget _earnings(RunnerJobView job, ErrandStatus status) {
    final fee = _line(PayoutFeedKind.runnerFee);
    final item = _line(PayoutFeedKind.itemReimbursement);
    final total =
        status == ErrandStatus.settled || fee?.status == PayoutLineStatus.paid
        ? SummaryCopy.youEarned
        : SummaryCopy.youllEarn;
    final itemStatus = item?.status;
    final noReceipt =
        needsReceipt(job) && _details.count(EvidenceType.receipt) == 0;
    final holdChip =
        itemStatus == PayoutLineStatus.onHold || (item == null && noReceipt)
        ? SummaryCopy.onHold
        : itemStatus == PayoutLineStatus.rejected
        ? SummaryCopy.notApproved
        : null;
    String payable = SummaryCopy.payable(status);
    if (fee?.status == PayoutLineStatus.payable) {
      payable = SummaryCopy.payable(ErrandStatus.confirmed);
    } else if (fee?.status == PayoutLineStatus.paid) {
      payable = SummaryCopy.payable(ErrandStatus.settled);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ReceiptCard(
          rows: [
            ReceiptRow(label: SummaryCopy.runnerFee, amount: job.runnerFee),
            ReceiptRow(label: total, amount: job.runnerFee, isTotal: true),
          ],
          separate: needsReceipt(job)
              ? ReceiptSeparateGroup(
                  rows: [
                    ReceiptRow(
                      label: SummaryCopy.itemReimbursement,
                      amount: item?.amount ?? job.itemAmount,
                    ),
                  ],
                  note: SummaryCopy.reimbursementNote,
                )
              : null,
        ),
        if (holdChip != null) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              StatusChip(
                label: holdChip,
                tone: holdChip == SummaryCopy.onHold
                    ? StatusTone.pending
                    : StatusTone.danger,
                size: StatusChipSize.compact,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  holdChip == SummaryCopy.onHold
                      ? SummaryCopy.onHoldNote
                      : SummaryCopy.notApprovedNote,
                  style: NitumeTextStyles.mutedSmall,
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        Text(
          payable,
          key: const ValueKey('summary-payable'),
          textAlign: TextAlign.center,
          style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 12),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    final Widget body;
    if (_revoked) {
      body = const Padding(
        padding: EdgeInsets.all(20),
        child: NitumeNotice(
          message: ActiveJobsCopy.revoked,
          tone: NitumeNoticeTone.danger,
        ),
      );
    } else if (job == null && _loading) {
      body = const Padding(
        padding: EdgeInsets.all(20),
        child: SkeletonCard(height: 200),
      );
    } else if (job == null) {
      body = NitumeErrorState(
        message: _error == null
            ? SummaryCopy.loadError
            : friendlyError(_error!),
        onRetry: () {
          setState(() => _loading = true);
          _load();
        },
      );
    } else {
      final status = job.status;
      final ended =
          status == ErrandStatus.cancelled || status == ErrandStatus.failed;
      final chip = runnerStatusPresentation(status);
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
        children: [
          Center(
            child: ended && chip != null
                ? StatusChip(label: chip.label, tone: chip.tone)
                : const SuccessMark(),
          ),
          const SizedBox(height: 12),
          Semantics(
            header: true,
            child: Text(
              ended
                  ? SummaryCopy.endedHeading
                  : SummaryCopy.heading(_s.session.user?.displayName),
              textAlign: TextAlign.center,
              style: NitumeTextStyles.dialogTitle,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${offerTitle(job)} · ${SummaryCopy.statusLine(status)}',
            textAlign: TextAlign.center,
            style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
          ),
          const SizedBox(height: 20),
          if (ended) _endedBody(job, status) else _earnings(job, status),
        ],
      );
    }
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: const NitumePushedHeader(title: SummaryCopy.title),
      body: body,
      bottomNavigationBar: NitumeFixedCta(
        child: NitumeButton.primary(
          label: SummaryCopy.backToJobs,
          expand: true,
          onPressed: _backToJobs,
        ),
      ),
    );
  }
}
