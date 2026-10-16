import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/live_updates.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/evidence.dart';
import '../../widgets/task_widgets.dart';
import '../shell/track_tab.dart' show itemAmountDue;

class _TaskData {
  const _TaskData({
    required this.errand,
    required this.payment,
    required this.evidence,
    required this.rated,
    required this.hasReport,
    this.refunds = const [],
  });

  final Errand errand;

  /// Every refund review, newest first (`_shared.md` §11, row 71); empty
  /// hides the group. Decrease reviews carry the price-change request.
  final List<CustomerRefund> refunds;

  /// A dispute exists (DISPUTED, or resolved to COMPLETED / CANCELLED).
  final bool hasReport;
  final PaymentSummary? payment;
  final List<Evidence> evidence;
  final bool rated;
}

/// States before the fees are paid ("Not paid yet.").
const _unpaid = {
  ErrandStatus.draft,
  ErrandStatus.requested,
  ErrandStatus.quoted,
  ErrandStatus.accepted,
};

/// States that offer `Rate this task` when unrated (CONFIRMED and SETTLED
/// are system-only, row 35, but may still come back from the API).
const _rateable = {
  ErrandStatus.completed,
  ErrandStatus.confirmed,
  ErrandStatus.settled,
};

/// States a dispute can resolve to (row 36), plus DISPUTED itself.
const _maybeReported = {
  ErrandStatus.disputed,
  ErrandStatus.completed,
  ErrandStatus.cancelled,
};

/// `v-task-detail`: one task in any state.
class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen>
    with ReloadOnReturn<TaskDetailScreen> {
  late final AppServices _services = context.services;
  Future<_TaskData>? _future;

  @override
  RouteObserver<ModalRoute<void>> get routeObserver => _services.routeObserver;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void onReturn() => _reload();

  ErrandWatch? _watch;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Live status changes (refund and dispute outcomes ride on them).
    _watch ??= _services.live.watch(
      widget.errandId,
      onStatus: (_) => _reload(),
      onEvidence: (_) => _reload(),
      onReconnected: _reload,
    );
  }

  @override
  void dispose() {
    _watch?.cancel();
    super.dispose();
  }

  void _reload() {
    final f = _load();
    setState(() {
      _future = f;
    });
  }

  Future<_TaskData> _load() async {
    final id = widget.errandId;
    final errand = await _services.errands.get(id);
    final results = await Future.wait<Object?>([
      _services.payments
          .forErrand(id)
          .then<Object?>((v) => v, onError: (_) => null),
      _services.evidence
          .list(id)
          .then<Object?>((v) => v, onError: (_) => <Evidence>[]),
      if (_rateable.contains(errand.status))
        _services.ratings
            .get(id)
            .then<Object?>((v) => v != null, onError: (_) => true)
      else
        Future<Object?>.value(true),
      if (_maybeReported.contains(errand.status))
        _services.disputes
            .forErrand(id)
            .then<Object?>((d) => d != null, onError: (_) => false)
      else
        Future<Object?>.value(false),
      _services.errands
          .refunds(id)
          .then<Object?>((v) => v, onError: (_) => <CustomerRefund>[]),
    ]);
    return _TaskData(
      refunds: results[4]! as List<CustomerRefund>,
      hasReport: errand.status == ErrandStatus.disputed || results[3]! as bool,
      errand: errand,
      payment: results[0] as PaymentSummary?,
      evidence: results[1]! as List<Evidence>,
      rated: results[2]! as bool,
    );
  }

  @override
  Widget build(BuildContext context) {
    return PushedScaffold(
      title: 'Task detail',
      body: AsyncBody<_TaskData>(
        future: _future,
        errorMessage: "Couldn't load this task.",
        onRetry: _reload,
        builder: (context, d) => _Body(data: d, onReported: _reload),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.data, required this.onReported});

  final _TaskData data;
  final VoidCallback onReported;

  ({String label, VoidCallback action})? _primary(BuildContext context) {
    final e = data.errand;
    return switch (e.status) {
      ErrandStatus.requested => (
        label: 'View request',
        action: () => Nav.toAwaitingQuote(context, e.id),
      ),
      ErrandStatus.quoted => (
        label: 'Review quote',
        action: () => Nav.toAwaitingQuote(context, e.id),
      ),
      ErrandStatus.accepted => (
        label: 'Pay now',
        action: () => Nav.toPayment(context, e.id),
      ),
      ErrandStatus.paymentConfirmed ||
      ErrandStatus.runnerAssigned ||
      ErrandStatus.runnerEnRoute ||
      ErrandStatus.arrived ||
      ErrandStatus.inProgress => (
        label: 'Track live',
        action: () => Nav.resetToTrack(context, e.id),
      ),
      ErrandStatus.awaitingCustomer => (
        label: 'Review evidence',
        action: () => Nav.toEvidenceConfirm(context, e.id),
      ),
      ErrandStatus.completed || ErrandStatus.confirmed || ErrandStatus.settled
          when !data.rated =>
        (label: 'Rate this task', action: () => Nav.toRate(context, e.id)),
      // Owner 2026-10-16: the next action after no runner accepted.
      ErrandStatus.expired => (
        label: 'Start a new task',
        action: () => Nav.toNewTask(context),
      ),
      _ => null,
    };
  }

  @override
  Widget build(BuildContext context) {
    final e = data.errand;
    final primary = _primary(context);
    // The Runner section appears once a runner accepted: never the offered
    // runner in PAYMENT_CONFIRMED or RUNNER_ASSIGNED (rows 176, 183).
    final r =
        e.status == ErrandStatus.paymentConfirmed ||
            e.status == ErrandStatus.runnerAssigned
        ? null
        : e.runner;
    final payment = data.payment?.payment;
    final paid = !_unpaid.contains(e.status) && payment != null;
    final canReport =
        e.status == ErrandStatus.inProgress ||
        e.status == ErrandStatus.awaitingCustomer ||
        e.status == ErrandStatus.completed;

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        TaskSummaryCard(
          errand: e,
          // EXPIRED with no refund review (never paid, or before the API
          // opens it); a review shows its own line in the refund group.
          note: e.status == ErrandStatus.expired && data.refunds.isEmpty
              ? 'No runner accepted your task in time.'
              : null,
          titleStyle: NitumeTextStyles.cardTitle.copyWith(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (primary != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: NitumeButton.primary(
              label: primary.label,
              expand: true,
              onPressed: primary.action,
            ),
          ),
        if (r != null) ...[
          const SectionLabel('Runner'),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: NitumeCard(
              child: RunnerSummaryTile(
                name: runnerShortName(r) ?? 'Your runner',
                meta: runnerMeta(r, withCount: true),
              ),
            ),
          ),
        ],
        if (data.evidence.isNotEmpty) ...[
          const SectionLabel('Evidence'),
          EvidenceGrid(
            items: evidenceThumbnails(data.evidence),
            onTap: (i) => openEvidenceViewer(
              context,
              data.evidence,
              i,
              refetch: () => context.services.evidence.list(e.id),
            ),
          ),
        ],
        const SectionLabel('Payment'),
        if (!paid && data.refunds.isEmpty)
          const MutedLine('Not paid yet.')
        else if (!paid)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: NitumeCard(
              border: NitumeCardBorder.dashed,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final r in data.refunds) RefundGroup(refund: r),
                ],
              ),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                NitumeCard(
                  border: NitumeCardBorder.dashed,
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ...feeTotalRows(payment, feeTotal: e.feeTotal),
                      ?itemAmountGroup(payment),
                      for (final r in data.refunds) RefundGroup(refund: r),
                    ],
                  ),
                ),
                // Only while something is still due (Track's rule):
                // send_to_runner items paid in the combined STK are not.
                if (ErrandRepository.activeStatuses.contains(e.status) &&
                    itemAmountDue(data.payment))
                  Align(
                    alignment: Alignment.centerLeft,
                    child: NitumeButton.link(
                      label: 'View payment details',
                      onPressed: () => Nav.toMerchantPayment(context, e.id),
                    ),
                  ),
              ],
            ),
          ),
        if (data.hasReport)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: MenuRow(
              label: 'View your report',
              onTap: () => Nav.toReport(context, e),
            ),
          )
        else if (canReport)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: MenuRow(
              label: 'Report a problem with this task',
              destructive: true,
              onTap: () async {
                final sent = await Nav.toReportProblem(context, e);
                if (sent == true) onReported();
              },
            ),
          ),
      ],
    );
  }
}
