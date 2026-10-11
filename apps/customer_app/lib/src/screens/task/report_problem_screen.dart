import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

/// `x-report-problem`: write mode opens a dispute (errand → DISPUTED,
/// OA-9); read mode shows the report and its status.
class ReportProblemScreen extends StatelessWidget {
  const ReportProblemScreen.write({super.key, required this.errand})
    : readMode = false;

  const ReportProblemScreen.read({super.key, required this.errand})
    : readMode = true;

  final Errand errand;
  final bool readMode;

  @override
  Widget build(BuildContext context) =>
      readMode ? _ReadReport(errand: errand) : _WriteReport(errand: errand);
}

/// Task line card: title 13.5/600 + Fira Code meta.
class _TaskLine extends StatelessWidget {
  const _TaskLine({required this.errand});

  final Errand errand;

  @override
  Widget build(BuildContext context) {
    final meta = errandRefMeta(errand);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: NitumeCard(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(errandTitle(errand), style: NitumeTextStyles.rowTitle),
            if (meta.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(meta, style: NitumeTextStyles.meta),
            ],
          ],
        ),
      ),
    );
  }
}

class _WriteReport extends StatefulWidget {
  const _WriteReport({required this.errand});

  final Errand errand;

  @override
  State<_WriteReport> createState() => _WriteReportState();
}

class _WriteReportState extends State<_WriteReport> {
  static const _max = 500;
  final _reason = TextEditingController();
  String? _error;
  bool _sending = false;
  bool _alreadyReported = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final reason = _reason.text.trim();
    if (reason.length < 5) {
      setState(() => _error = 'Tell us a bit more (at least 5 characters).');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
      _alreadyReported = false;
    });
    final services = context.services;
    try {
      await services.disputes.open(errandId: widget.errand.id, reason: reason);
      if (!mounted) return;
      showSnack(context, "Report sent. We'll be in touch.");
      Navigator.of(context).pop(true);
    } on NitumeApiException catch (e) {
      var message = "Couldn't send your report. Try again.";
      var already = false;
      if (e.statusCode == 409 || e.statusCode == 400) {
        message = "This task can't be reported right now.";
        if (e.statusCode == 409) {
          final existing = await services.disputes
              .forErrand(widget.errand.id)
              .then<Dispute?>((d) => d, onError: (_) => null);
          if (existing != null) {
            message = "You've already reported this task.";
            already = true;
          }
        }
      }
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = message;
        _alreadyReported = already;
      });
    }
  }

  Future<void> _back() async {
    if (_reason.text.trim().isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showNitumeConfirmDialog(
      context,
      title: 'Discard your report?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep writing',
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _reason.text.trim().isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: PushedScaffold(
        title: 'Report a problem',
        onBack: _back,
        body: ListView(
          children: [
            _TaskLine(errand: widget.errand),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: NitumeFormCard(
                label: 'What went wrong?',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    NitumeField.multiline(
                      controller: _reason,
                      hint:
                          'Tell us what happened, e.g. the wrong item was '
                          'delivered.',
                      minLines: 5,
                      maxLines: 8,
                      enabled: !_sending,
                      errorText: _error,
                      onChanged: (_) =>
                          setState(() => clampText(_reason, _max)),
                    ),
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        formatCounter(_reason.text.length, _max),
                        style: NitumeTextStyles.meta,
                      ),
                    ),
                    if (_alreadyReported)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: NitumeButton.link(
                          label: 'View your report',
                          onPressed: () => Navigator.of(context)
                              .pushReplacementNamed(
                                Routes.reportProblem,
                                arguments: ReportArgs(
                                  errand: widget.errand,
                                  readMode: true,
                                ),
                              ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: NitumeNotice(
                message:
                    'Our team will review your report and contact you. '
                    'Your runner is told the task is under review.',
              ),
            ),
          ],
        ),
        cta: FixedCta(
          child: NitumeButton.primary(
            label: 'Send report',
            expand: true,
            loading: _sending,
            onPressed: _send,
          ),
        ),
      ),
    );
  }
}

class _ReadReport extends StatefulWidget {
  const _ReadReport({required this.errand});

  final Errand errand;

  @override
  State<_ReadReport> createState() => _ReadReportState();
}

class _ReadReportState extends State<_ReadReport> {
  late Future<Dispute?> _future = context.services.disputes.forErrand(
    widget.errand.id,
  );

  static ({String label, StatusTone tone}) _chip(DisputeStatus s) =>
      switch (s) {
        DisputeStatus.open => (
          label: 'Report received',
          tone: StatusTone.pending,
        ),
        DisputeStatus.underReview => (
          label: 'Under review',
          tone: StatusTone.pending,
        ),
        DisputeStatus.resolved => (label: 'Resolved', tone: StatusTone.success),
        DisputeStatus.rejected => (label: 'Closed', tone: StatusTone.info),
      };

  @override
  Widget build(BuildContext context) {
    return PushedScaffold(
      title: 'Your report',
      body: AsyncBody<Dispute?>(
        future: _future,
        errorMessage: "Couldn't load your report.",
        onRetry: () {
          final f = context.services.disputes.forErrand(widget.errand.id);
          setState(() {
            _future = f;
          });
        },
        builder: (context, d) {
          if (d == null) {
            return const NitumeEmptyState(message: 'No report for this task.');
          }
          final chip = _chip(d.status);
          final closed =
              d.status == DisputeStatus.resolved ||
              d.status == DisputeStatus.rejected;
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: NitumeCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StatusChip(label: chip.label, tone: chip.tone),
                      const SizedBox(height: 10),
                      Text(
                        errandTitle(widget.errand),
                        style: NitumeTextStyles.cardTitle,
                      ),
                      if (d.createdAt != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Reported ${formatDayTime(d.createdAt!)}',
                          style: NitumeTextStyles.metaLarge,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SectionLabel('What you told us'),
              BodyCard(text: d.reason),
              if (closed &&
                  d.resolution != null &&
                  d.resolution!.trim().isNotEmpty) ...[
                const SectionLabel('Outcome'),
                // Row 79: the admin's resolution note, shared with the
                // runner; internal notes never reach this screen. The
                // verdict has no customer copy in the spec: the errand chip
                // (COMPLETED / CANCELLED) and the refund group on Task
                // detail carry it.
                BodyCard(
                  text: d.resolution!,
                  meta: switch (d.resolvedAt ?? d.updatedAt) {
                    final at? => 'Resolved ${formatDayTime(at)}',
                    null => null,
                  },
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
