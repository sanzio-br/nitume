import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';
import '../../widgets/evidence.dart';
import '../../widgets/task_widgets.dart';

class _EvidenceData {
  const _EvidenceData({
    required this.errand,
    required this.evidence,
    required this.payment,
  });

  final Errand errand;
  final List<Evidence> evidence;
  final Payment? payment;
}

/// `v-evidence-confirm`: review evidence, then "Confirm completion"
/// (AWAITING_CUSTOMER → COMPLETED only, OA-6/OA-7). No escrow wording.
class EvidenceConfirmScreen extends StatefulWidget {
  const EvidenceConfirmScreen({super.key, required this.errandId});

  final String errandId;

  @override
  State<EvidenceConfirmScreen> createState() => _EvidenceConfirmScreenState();
}

class _EvidenceConfirmScreenState extends State<EvidenceConfirmScreen> {
  late final AppServices _services = context.services;
  _EvidenceData? _data;
  Object? _error;
  bool _confirming = false;
  Poller? _poller;

  @override
  void initState() {
    super.initState();
    _load();
    // Evidence-uploaded events need the socket client (row 29): poll.
    _poller = Poller(
      interval: const Duration(seconds: 15),
      enabled: _services.pollingEnabled,
      isVisible: () => mounted && isRouteVisible(context),
      onTick: _load,
    );
  }

  @override
  void dispose() {
    _poller?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final id = widget.errandId;
      final errand = await _services.errands.get(id);
      if (!mounted) return;
      if (ErrandRepository.finishedStatuses.contains(errand.status)) {
        Nav.replaceWithTaskDetail(context, id);
        return;
      }
      final results = await Future.wait<Object?>([
        _services.evidence.list(id),
        _services.payments
            .forErrand(id)
            .then<Object?>((v) => v, onError: (_) => null),
      ]);
      if (!mounted) return;
      setState(() {
        _error = null;
        _data = _EvidenceData(
          errand: errand,
          evidence: results[0]! as List<Evidence>,
          payment: (results[1] as PaymentSummary?)?.payment,
        );
      });
    } on Object catch (e) {
      if (mounted && _data == null) setState(() => _error = e);
    }
  }

  Future<void> _confirm() async {
    setState(() => _confirming = true);
    try {
      await _services.errands.transition(
        widget.errandId,
        ErrandStatus.completed,
      );
      if (mounted) Nav.replaceWithRate(context, widget.errandId);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _confirming = false);
      if (e.statusCode == 409) {
        _load();
      } else {
        showSnack(context, "Couldn't confirm. Try again.");
      }
    }
  }

  Future<void> _report() async {
    final sent = await Nav.toReportProblem(context, _data!.errand);
    if (sent == true && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final Widget body;
    if (_error != null) {
      body = NitumeErrorState(
        message: "Couldn't load this task.",
        onRetry: () {
          setState(() => _error = null);
          _load();
        },
      );
    } else if (d == null) {
      body = const SkeletonList(count: 2, height: 110);
    } else {
      final notes = d.errand.runnerNotes?.trim();
      final payment = d.payment;
      body = ListView(
        padding: const EdgeInsets.only(bottom: 16),
        children: [
          SectionLabel(
            'Photos & video (${d.evidence.length})',
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
          ),
          if (d.evidence.isEmpty)
            const MutedLine("The runner hasn't uploaded evidence yet.")
          else
            EvidenceGrid(
              items: evidenceThumbnails(d.evidence),
              onTap: (i) => openEvidenceViewer(context, d.evidence, i),
            ),
          if (notes != null && notes.isNotEmpty) ...[
            const SectionLabel('Runner notes'),
            BodyCard(text: '"$notes"'),
          ],
          if (payment != null) ...[
            const SectionLabel('Payment summary'),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: ReceiptCard(
                rows: paidFeeRows(payment),
                separate: itemAmountGroup(payment),
              ),
            ),
          ],
          if (d.errand.status == ErrandStatus.awaitingCustomer)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
              child: Center(
                child: NitumeButton.text(
                  label: 'Report a problem',
                  destructive: true,
                  onPressed: _report,
                ),
              ),
            ),
        ],
      );
    }
    final canConfirm =
        d != null && d.errand.status == ErrandStatus.awaitingCustomer;
    return PushedScaffold(
      title: 'Review evidence',
      body: body,
      cta: canConfirm
          ? FixedCta(
              child: NitumeButton.primary(
                label: 'Confirm completion',
                expand: true,
                loading: _confirming,
                onPressed: d.evidence.isEmpty ? null : _confirm,
              ),
            )
          : null,
    );
  }
}
