import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/active_jobs.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../widgets/common.dart';
import '../jobs/offer_presentation.dart';
import 'active_presentation.dart';
import 'cant_complete_dialog.dart';

/// `v-active` copy (`docs/specs/runner/v-active.md`; mockup copy where the
/// spec says so, everything else proposed).
abstract final class ActiveCopy {
  static const title = 'Active job';
  static const checklist = 'Checklist';
  static const arrivedTitle = 'Arrived at location';
  static const arrivedTodo = "Tap I've arrived when you get there";
  static const gps = 'GPS confirmed';
  static const byYou = 'Marked by you';
  static const photos = 'Photos';
  static const required = 'Required';
  static const receipt = 'Receipt';
  static const receiptTodo = 'Required for your reimbursement';
  static const notes = 'Notes for the customer';
  static const notesTodo = 'Write a short summary';
  static const upload = 'Upload';
  static const add = 'Add';
  static const edit = 'Edit';
  static const priceLabel = 'Price too low for the item found?';
  static const priceRow = 'Request price authorization';
  static const priceSub = 'Ask the customer to approve a higher amount';
  static const priceRejected =
      'Price change not approved. Continue at the original amount or contact '
      'support.';
  static const arrive = "I've arrived";
  static const arriveCaption =
      "We'll also detect this automatically when you get there.";
  static const start = 'Start task';
  static const startCaption = "Let the customer know you've started.";
  static const complete = 'Mark task complete';
  static const completeCaption = 'Customer will confirm evidence';
  static const addNotesToFinish = 'Add notes to finish.';
  static const waitPriceToFinish = "Wait for the customer's answer to finish.";
  static const cantComplete = "Can't complete this task";
  static const help = 'Get help with this task';
  static const otherJobs = 'Other jobs';
  static const finishTitle = 'Finish and send to the customer?';
  static const finishBody =
      'The customer will review your photos and notes. You can still edit '
      'your notes until they confirm.';
  static const finish = 'Finish';
  static const notYet = 'Not yet';
  static const emptyTitle = 'No active job';
  static const emptyBody = 'Accept a job from the Jobs tab to start.';
  static const goToJobs = 'Go to jobs';
  static const loadError = "Couldn't load your job.";
  static const awaiting =
      "Waiting for the customer to confirm. You'll be notified.";
  static const viewSummary = 'View job summary';
  static const disputed =
      'The customer reported a problem. Our team is reviewing it.';
  static const outcome = 'Outcome';
  static const jobComplete = 'Job complete';
  static const backToJobs = 'Back to jobs';
  static const ended =
      "This task ended before completion, so there's no runner fee.";
  static const endedReimburse =
      "If you already bought the item, we'll review your receipt and "
      'reimburse what you spent.';
  static const uploadReceipt = 'Upload receipt';
  static const windowLead = 'You can upload it until ';
  static const windowClosed =
      'The upload window has closed. Contact support with your receipt.';
  static const contactSupport = 'Contact support';
  static const offline =
      "Saved on your phone. We'll send it when you're back online.";
  static const locationOff =
      "Location is off. The customer can't see where you are.";
  static const openSettings = 'Open Settings';
  static const openFailed = "Couldn't open the page. Try again later.";
  static const notesSaved = 'Notes saved.';

  static String photosDone(int n) =>
      n == 1 ? '1 photo uploaded' : '$n photos uploaded';
  static String receiptsDone(int n) =>
      n == 1 ? '1 receipt uploaded' : '$n receipts uploaded';
}

const _ended = {ErrandStatus.cancelled, ErrandStatus.failed};
const _done = {
  ErrandStatus.completed,
  ErrandStatus.confirmed,
  ErrandStatus.settled,
};
const _arrivedOrLater = {
  ErrandStatus.arrived,
  ErrandStatus.inProgress,
  ErrandStatus.awaitingCustomer,
  ErrandStatus.disputed,
  ErrandStatus.completed,
  ErrandStatus.confirmed,
  ErrandStatus.settled,
};

/// `v-active` root tab: the held job's working screen (rows 113, 120, 128,
/// 129, 132, 211). Jobs, transitions and notes come from [ActiveJobs];
/// this screen reads the shown job's evidence, history, price request and
/// dispute.
class ActiveTab extends StatefulWidget {
  const ActiveTab({super.key});

  @override
  State<ActiveTab> createState() => _ActiveTabState();
}

class _ActiveTabState extends State<ActiveTab> {
  AppServices? _services;
  final _subs = <StreamSubscription<Object?>>[];
  final _details = <String, JobDetails>{};
  String? _detailsKey;
  String? _error;
  bool _busy = false;
  DevicePosition? _fix;

  AppServices get _s => _services!;
  ActiveJobs get _a => _s.active;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = _services = AppScope.read(context);
      s.active.addListener(_changed);
      s.shell.addListener(_changed);
      s.uploads.addListener(_changed);
      s.pings.status.addListener(_changed);
      s.queue.addListener(_changed);
      _subs.addAll([
        s.live.evidenceUploads.listen((e) => _refreshDetails(e.errandId)),
        s.live.priceChangeDecisions.listen((e) => _refreshDetails(e.errandId)),
      ]);
      setState(() {});
      s.active.load();
    });
  }

  @override
  void dispose() {
    final s = _services;
    if (s != null) {
      s.active.removeListener(_changed);
      s.shell.removeListener(_changed);
      s.uploads.removeListener(_changed);
      s.pings.status.removeListener(_changed);
      s.queue.removeListener(_changed);
    }
    for (final sub in _subs) {
      sub.cancel();
    }
    super.dispose();
  }

  void _changed() {
    if (!mounted) return;
    final notice = _a.takeNotice();
    setState(() {
      if (notice != null) _error = notice;
    });
    final job = _shown();
    if (job == null) return;
    final key = '${job.id}:${_a.statusOf(job).wire}:${job.itemAmount}';
    if (key == _detailsKey) return;
    _detailsKey = key;
    unawaited(_refreshDetails(job.id));
    unawaited(_readFix(job));
  }

  Future<void> _readFix(RunnerJobView job) async {
    if (!RunnerJobsRepository.workingStatuses.contains(_a.statusOf(job))) {
      return;
    }
    try {
      final fix = await _s.location.current();
      if (mounted) setState(() => _fix = fix);
    } on Object {
      // No distance without a fix.
    }
  }

  Future<void> _refreshDetails(String errandId) async {
    final job = _a.byId(errandId);
    if (job == null) return;
    final jobs = _s.jobs;
    final status = _a.statusOf(job);
    Future<T?> quiet<T>(Future<T> f) async {
      try {
        return await f;
      } on Object {
        return null;
      }
    }

    final evidence = quiet(jobs.evidence(errandId));
    final history = quiet(jobs.history(errandId));
    final pending = canRequestPrice(job, status)
        ? quiet(jobs.pendingPriceChange(errandId))
        : Future<PriceChangeRequest?>.value();
    final dispute = status == ErrandStatus.disputed
        ? quiet(jobs.dispute(errandId))
        : Future<Dispute?>.value();
    final d = JobDetails(
      evidence: await evidence ?? _details[errandId]?.evidence ?? const [],
      history: await history ?? _details[errandId]?.history ?? const [],
      pendingPrice: await pending,
      dispute: await dispute,
    );
    if (mounted) setState(() => _details[errandId] = d);
  }

  /// The selection rule (`v-active.md`, row 211, proposed).
  RunnerJobView? _shown() {
    final s = _services;
    if (s == null) return null;
    final a = s.active;
    final focused = s.shell.focusedJob;
    if (focused != null) {
      final j = a.byId(focused);
      if (j != null) return j;
    }
    final w = a.working;
    if (w != null) return w;
    for (final j in a.held) {
      final st = a.statusOf(j);
      if (st == ErrandStatus.awaitingCustomer || st == ErrandStatus.disputed) {
        return j;
      }
    }
    for (final j in a.held) {
      if (_ended.contains(a.statusOf(j)) &&
          needsReceipt(j) &&
          (_details[j.id]?.count(EvidenceType.receipt) ?? 0) == 0) {
        return j;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- actions

  Future<void> _transition(
    RunnerJobView job,
    ErrandStatus to, {
    String? note,
  }) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final r = await _a.transition(job, to, note: note);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = r.error;
    });
    if (r.ok && to == ErrandStatus.awaitingCustomer) {
      await Nav.toJobSummary(context, job.id);
    }
  }

  Future<void> _complete(RunnerJobView job) async {
    final ok = await showNitumeConfirmDialog(
      context,
      title: ActiveCopy.finishTitle,
      body: ActiveCopy.finishBody,
      confirmLabel: ActiveCopy.finish,
      cancelLabel: ActiveCopy.notYet,
      destructive: false,
    );
    if (ok && mounted) await _transition(job, ErrandStatus.awaitingCustomer);
  }

  Future<void> _cantComplete(RunnerJobView job) async {
    final note = await CantCompleteDialog.show(context);
    if (note != null && mounted) {
      await _transition(job, ErrandStatus.failed, note: note);
    }
  }

  Future<void> _open(Uri? uri) async {
    if (uri == null) return;
    final ok = await _s.appConfig.open(uri);
    if (!ok && mounted) showSnack(context, ActiveCopy.openFailed);
  }

  void _backToJobs() {
    _s.shell
      ..clearFocus()
      ..select(RunnerTab.jobs);
  }

  Future<void> _evidence(RunnerJobView job, EvidenceType type) async {
    await Nav.toEvidence(context, job.id, type);
    if (mounted) unawaited(_refreshDetails(job.id));
  }

  Future<void> _notes(RunnerJobView job) async {
    final saved = await Nav.toNotes(context, job.id);
    if (saved == true && mounted) showSnack(context, ActiveCopy.notesSaved);
  }

  // ------------------------------------------------------------------ parts

  String? _firstMissing(RunnerJobView job, JobDetails d) {
    if (d.count(EvidenceType.photo) == 0) return ActiveJobsCopy.photosMissing;
    if (needsReceipt(job) && d.count(EvidenceType.receipt) == 0) {
      return ActiveJobsCopy.receiptMissing;
    }
    final notes = _a.notesOf(job)?.trim() ?? '';
    // Notes are required for Check It For Me (proposed, row 120).
    if (job.category == ErrandCategory.checkItForMe && notes.isEmpty) {
      return ActiveCopy.addNotesToFinish;
    }
    if (d.pendingPrice != null) return ActiveCopy.waitPriceToFinish;
    return null;
  }

  Widget? _chip(ErrandStatus status) {
    final p = runnerStatusPresentation(status);
    if (p == null) return null;
    return StatusChip(
      label: p.label,
      tone: p.tone,
      size: StatusChipSize.compact,
    );
  }

  Widget _header(RunnerJobView job, ErrandStatus status) {
    final meta = jobHeaderMeta(job, status, _s.clock());
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            offerTitle(job),
            style: NitumeTextStyles.cardTitle.copyWith(fontSize: 15),
          ),
          const SizedBox(height: 2),
          Text.rich(
            meta.span,
            key: const ValueKey('active-job-meta'),
            semanticsLabel: meta.text,
            style: NitumeTextStyles.mutedSmall,
          ),
        ],
      ),
    );
  }

  Widget _map(RunnerJobView job, ErrandStatus status) {
    final dest = destinationFor(job, status);
    final fix = _fix;
    final String detail;
    if (dest != null && fix != null) {
      final target = DevicePosition(
        lat: dest.lat,
        lng: dest.lng,
        timestamp: fix.timestamp,
      );
      detail = formatDistanceKm(fix.distanceTo(target) / 1000);
    } else {
      detail = OfferCopy.distanceUnavailable;
    }
    final drop = pointOf(job, ErrandPointType.dropoff);
    final first = firstPointOf(job);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: JobRouteMap(
        config: _s.appConfig,
        taskPoint: first?.point,
        dropoff: identical(drop, first) ? null : drop?.point,
        self: fix == null ? null : GeoPoint(lat: fix.lat, lng: fix.lng),
        routeTo: dest?.point,
        overlay: dest == null
            ? null
            : NavigationChip(
                destination: dest.addressText,
                detail: detail,
                onNavigate: () => _open(navigationUri(dest)),
              ),
      ),
    );
  }

  List<Widget> _checklist(
    RunnerJobView job,
    ErrandStatus status,
    JobDetails d,
  ) {
    final arrived = _arrivedOrLater.contains(status);
    final arrival = d.entryFor(ErrandStatus.arrived);
    var arrivedSub = ActiveCopy.arrivedTodo;
    if (arrived) {
      final at = arrival?.createdAt;
      final who = arrival?.actorType == StatusHistoryActor.system
          ? ActiveCopy.gps
          : ActiveCopy.byYou;
      arrivedSub = at == null ? who : '${formatClockEat(at)} · $who';
    }
    final photos = d.count(EvidenceType.photo);
    final receipts = d.count(EvidenceType.receipt);
    final notes = _a.notesOf(job)?.trim() ?? '';
    final photoAction =
        status == ErrandStatus.arrived || status == ErrandStatus.inProgress;
    final receiptAction =
        photoAction || status == ErrandStatus.awaitingCustomer;
    final notesAction = RunnerJobsRepository.runnerNotesStatuses.contains(
      status,
    );
    Widget card(Widget c) =>
        Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: c);
    final uploader = _s.uploads.existing(job.id);
    final pending = [
      ...?uploader?.items.where(
        (i) => i.status != EvidenceUploadStatus.uploaded,
      ),
    ];
    final thumbs = [
      for (final e in d.evidence) EvidenceThumbnail(imageUrl: e.url),
    ];
    return [
      const SectionLabel(ActiveCopy.checklist),
      card(
        ChecklistStepCard(
          title: ActiveCopy.arrivedTitle,
          subtitle: arrivedSub,
          done: arrived,
        ),
      ),
      card(
        ChecklistStepCard(
          key: const ValueKey('step-photos'),
          title: ActiveCopy.photos,
          subtitle: photos == 0
              ? ActiveCopy.required
              : ActiveCopy.photosDone(photos),
          done: photos > 0,
          actionLabel: photoAction ? ActiveCopy.upload : null,
          onAction: photoAction
              ? () => _evidence(job, EvidenceType.photo)
              : null,
        ),
      ),
      if (needsReceipt(job))
        card(
          ChecklistStepCard(
            key: const ValueKey('step-receipt'),
            title: ActiveCopy.receipt,
            subtitle: receipts == 0
                ? ActiveCopy.receiptTodo
                : ActiveCopy.receiptsDone(receipts),
            done: receipts > 0,
            actionLabel: receiptAction ? ActiveCopy.upload : null,
            onAction: receiptAction
                ? () => _evidence(job, EvidenceType.receipt)
                : null,
          ),
        ),
      card(
        ChecklistStepCard(
          key: const ValueKey('step-notes'),
          title: ActiveCopy.notes,
          subtitle: notes.isEmpty
              ? ActiveCopy.notesTodo
              : (notes.length > 40 ? '${notes.substring(0, 40)}…' : notes),
          done: notes.isNotEmpty,
          actionLabel: notesAction
              ? (notes.isEmpty ? ActiveCopy.add : ActiveCopy.edit)
              : null,
          onAction: notesAction ? () => _notes(job) : null,
        ),
      ),
      if (pending.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: CaptureThumbnailRow(
            children: [
              for (final i in pending.take(3))
                CaptureThumbnail(
                  state: i.captureState,
                  image: FileImage(File(i.path)),
                  caption: formatClockEat(i.capturedAt),
                  onRetry: i.canRetry ? () => uploader?.retry(i) : null,
                ),
            ],
          ),
        ),
      if (thumbs.isNotEmpty)
        EvidenceGrid(
          items: thumbs,
          onTap: (i) =>
              EvidenceViewer.show(context, items: thumbs, initialIndex: i),
        ),
    ];
  }

  NitumeNotice _amountNotice(String lead, String amount) => NitumeNotice(
    message: '$lead$amount.',
    richMessage: TextSpan(
      children: [
        TextSpan(text: lead),
        NumSpan(amount),
        const TextSpan(text: '.'),
      ],
    ),
  );

  List<Widget> _price(RunnerJobView job, JobDetails d) {
    const pad = EdgeInsets.fromLTRB(20, 0, 20, 12);
    final pending = d.pendingPrice;
    if (pending != null) {
      return [
        Padding(
          padding: pad,
          child: _amountNotice(
            'Waiting for the customer to approve ',
            formatKes(pending.toPrice),
          ),
        ),
      ];
    }
    final decision = _a.priceDecision(job.id);
    return [
      if (decision?.outcome == PriceDecisionOutcome.rejected)
        const Padding(
          padding: pad,
          child: NitumeNotice(message: ActiveCopy.priceRejected),
        ),
      // send_to_runner: the approved state waits for row 248 (difference
      // paid), so no "approved" line is shown there yet.
      if (decision?.outcome == PriceDecisionOutcome.approved &&
          job.merchantRoute != MerchantRoute.sendToRunner)
        Padding(
          padding: pad,
          child: _amountNotice(
            'Price change approved. New item amount ',
            formatKes(decision!.toPrice),
          ),
        ),
      const SectionLabel(ActiveCopy.priceLabel),
      Padding(
        padding: pad,
        child: MenuRow(
          label: ActiveCopy.priceRow,
          subtitle: ActiveCopy.priceSub,
          leadingIcon: Icons.error_outline_rounded,
          onTap: () async {
            final sent = await Nav.toPriceRequest(context, job.id);
            if (sent == true && mounted) unawaited(_refreshDetails(job.id));
          },
        ),
      ),
    ];
  }

  Widget _primary(RunnerJobView job, ErrandStatus status, JobDetails d) {
    final (label, caption, to) = switch (status) {
      ErrandStatus.runnerEnRoute => (
        ActiveCopy.arrive,
        ActiveCopy.arriveCaption,
        ErrandStatus.arrived,
      ),
      ErrandStatus.arrived => (
        ActiveCopy.start,
        ActiveCopy.startCaption,
        ErrandStatus.inProgress,
      ),
      _ => (
        ActiveCopy.complete,
        ActiveCopy.completeCaption,
        ErrandStatus.awaitingCustomer,
      ),
    };
    final missing = status == ErrandStatus.inProgress
        ? _firstMissing(job, d)
        : null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NitumeButton.primary(
            label: label,
            expand: true,
            loading: _busy,
            onPressed: missing != null
                ? null
                : () => to == ErrandStatus.awaitingCustomer
                      ? _complete(job)
                      : _transition(job, to),
          ),
          const SizedBox(height: 6),
          Text(
            missing ?? caption,
            textAlign: TextAlign.center,
            style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _secondary(RunnerJobView job, ErrandStatus status) {
    if (status == ErrandStatus.runnerEnRoute) {
      return Center(
        child: NitumeButton.text(
          label: ActiveCopy.cantComplete,
          onPressed: _busy ? null : () => _cantComplete(job),
        ),
      );
    }
    // Row 132: no FAILED from ARRIVED / IN_PROGRESS; Support handles it.
    final support = _s.appConfig.supportLink;
    if (support == null) return const SizedBox.shrink();
    return Center(
      child: NitumeButton.text(
        label: ActiveCopy.help,
        onPressed: () => _open(support),
      ),
    );
  }

  List<Widget> _otherJobs(RunnerJobView shown) {
    final others = [
      for (final j in _a.held)
        if (j.id != shown.id &&
            RunnerJobsRepository.activeStatuses.contains(_a.statusOf(j)))
          j,
    ];
    if (others.isEmpty) return const [];
    return [
      const SectionLabel(ActiveCopy.otherJobs),
      for (final j in others)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: TaskRow(
            key: ValueKey('other-job-${j.id}'),
            title: offerTitle(j),
            meta: j.reference.isEmpty ? null : '#${j.reference}',
            trailing: _chip(_a.statusOf(j)),
            onTap: () => _s.shell.showJob(j.id),
          ),
        ),
    ];
  }

  Widget _endedCard(RunnerJobView job, ErrandStatus status, JobDetails d) {
    final style = NitumeTextStyles.muted.copyWith(fontSize: 13);
    Widget link(String label, VoidCallback onPressed) => Align(
      alignment: Alignment.centerLeft,
      child: NitumeButton.link(label: label, onPressed: onPressed),
    );
    final children = <Widget>[];
    if (_done.contains(status)) {
      children.addAll([
        Text(ActiveCopy.jobComplete, style: NitumeTextStyles.rowTitle),
        const SizedBox(height: 6),
        link(ActiveCopy.viewSummary, () => Nav.toJobSummary(context, job.id)),
      ]);
    } else {
      children.add(Text(ActiveCopy.ended, style: style));
      if (needsReceipt(job)) {
        children.addAll([
          const SizedBox(height: 6),
          Text(ActiveCopy.endedReimburse, style: style),
        ]);
        final endsAt = d.endedAt?.add(RunnerJobsRepository.endedJobWindow);
        final open = endsAt == null || _s.clock().isBefore(endsAt);
        if (open) {
          children.addAll([
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: NitumeButton.secondary(
                label: ActiveCopy.uploadReceipt,
                size: NitumeButtonSize.small,
                onPressed: () => _evidence(job, EvidenceType.receipt),
              ),
            ),
            if (endsAt != null) ...[
              const SizedBox(height: 8),
              Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(text: ActiveCopy.windowLead),
                    NumSpan(formatDayTimeEat(endsAt, now: _s.clock())),
                    const TextSpan(text: '.'),
                  ],
                ),
                style: NitumeTextStyles.mutedSmall,
              ),
            ],
            link(
              ActiveCopy.viewSummary,
              () => Nav.toJobSummary(context, job.id),
            ),
          ]);
        } else {
          children.addAll([
            const SizedBox(height: 8),
            Text(ActiveCopy.windowClosed, style: style),
            if (_s.appConfig.supportLink != null)
              link(
                ActiveCopy.contactSupport,
                () => _open(_s.appConfig.supportLink),
              ),
          ]);
        }
      }
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: NitumeCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: _chip(status) ?? const SizedBox.shrink(),
            ),
            const SizedBox(height: 10),
            ...children,
            const SizedBox(height: 10),
            NitumeButton.outline(
              label: ActiveCopy.backToJobs,
              expand: true,
              onPressed: _backToJobs,
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _body(RunnerJobView job) {
    final status = _a.statusOf(job);
    final d = _details[job.id] ?? const JobDetails();
    final working = RunnerJobsRepository.workingStatuses.contains(status);
    const pad = EdgeInsets.fromLTRB(20, 0, 20, 12);
    final out = <Widget>[_header(job, status)];
    if (_ended.contains(status) || _done.contains(status)) {
      return [...out, _endedCard(job, status, d), ..._otherJobs(job)];
    }
    if (working) out.add(_map(job, status));
    if (working && _s.pings.status.value == PingerStatus.locationUnavailable) {
      out.add(
        Padding(
          padding: pad,
          child: NitumeNotice(
            message: ActiveCopy.locationOff,
            action: NitumeButton.outline(
              label: ActiveCopy.openSettings,
              size: NitumeButtonSize.small,
              onPressed: () => _s.permissions.openSettings(),
            ),
          ),
        ),
      );
    }
    if (_a.hasQueued(job.id)) {
      out.add(
        const Padding(
          padding: pad,
          child: NitumeNotice(message: ActiveCopy.offline),
        ),
      );
    }
    if (status == ErrandStatus.awaitingCustomer) {
      out.add(
        const Padding(
          padding: pad,
          child: NitumeNotice(message: ActiveCopy.awaiting),
        ),
      );
    }
    if (status == ErrandStatus.disputed) {
      out.add(
        const Padding(
          padding: pad,
          child: NitumeNotice(message: ActiveCopy.disputed),
        ),
      );
      final resolution = d.dispute?.resolution;
      if (resolution != null && resolution.isNotEmpty) {
        out.addAll([
          const SectionLabel(ActiveCopy.outcome),
          Padding(
            padding: pad,
            child: Text(
              resolution,
              style: NitumeTextStyles.body.copyWith(fontSize: 13),
            ),
          ),
        ]);
      }
    }
    out.addAll(_checklist(job, status, d));
    if (canRequestPrice(job, status)) out.addAll(_price(job, d));
    if (working) {
      out.add(_primary(job, status, d));
      out.add(_secondary(job, status));
    } else {
      out.add(
        Center(
          child: NitumeButton.text(
            label: ActiveCopy.viewSummary,
            onPressed: () => Nav.toJobSummary(context, job.id),
          ),
        ),
      );
    }
    out.addAll(_otherJobs(job));
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final s = _services;
    final job = _shown();
    final status = job == null ? null : _a.statusOf(job);
    final List<Widget> content;
    if (s == null || (!s.active.loaded && s.active.error == null)) {
      content = const [
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: SkeletonCard(height: 190),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
          child: SkeletonCard(),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
          child: SkeletonCard(),
        ),
      ];
    } else if (!s.active.loaded) {
      content = [
        NitumeErrorState(message: ActiveCopy.loadError, onRetry: s.active.load),
      ];
    } else if (job == null) {
      content = [
        const NitumeEmptyState(
          title: ActiveCopy.emptyTitle,
          message: ActiveCopy.emptyBody,
        ),
        Center(
          child: NitumeButton.outline(
            label: ActiveCopy.goToJobs,
            onPressed: _backToJobs,
          ),
        ),
      ];
    } else {
      content = _body(job);
    }
    final error = _error;
    final chip = status == null ? null : _chip(status);
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          await s?.active.load();
          final j = _shown();
          if (j != null) await _refreshDetails(j.id);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            NitumeTopBar(title: ActiveCopy.title, actions: [?chip]),
            if (error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: NitumeNotice(
                  message: error,
                  tone: NitumeNoticeTone.danger,
                ),
              ),
            ...content,
          ],
        ),
      ),
    );
  }
}
