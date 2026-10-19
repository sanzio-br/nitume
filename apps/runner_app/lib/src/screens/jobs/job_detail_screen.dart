import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/location_gate.dart';
import '../../services/shell_controller.dart';
import '../../widgets/common.dart';
import 'jobs_tab.dart';
import 'offer_presentation.dart';

/// `v-job-detail` copy (`docs/specs/runner/v-job-detail.md`).
abstract final class JobDetailCopy {
  static const title = 'Job offer';
  static const distance = 'Distance';
  static const deadline = 'Deadline';
  static const payout = 'Payout';
  static const itemAmount = 'Item amount';
  static const howItsPaid = "How it's paid";
  static const items = 'Items';
  static const pickup = 'Pickup';
  static const dropoff = 'Drop-off';
  static const taskLocation = 'Task location';
  static const decline = 'Decline';
  static const accept = 'Accept job';
  static const aboveLimitCaption = 'Above your purchase limit';
  static const ended = 'This offer is no longer available.';
  static const backToJobs = 'Back to jobs';
  static const goOnline = 'Go online to accept jobs.';
  static const reimbursement =
      "Keep the receipt. You'll upload it before you finish, and we reimburse "
      'the item amount once the customer confirms and the review window '
      'closes.';
  static const endsInLead = 'Offer ends in ';
}

/// `v-job-detail`: one offer in full (map, instructions, distance,
/// deadline, payout, purchase terms) with accept and decline (rows 108,
/// 113, 205, 206, 210, 229).
///
/// Shows the listed offer at once and refreshes it from
/// `GET /runners/me/jobs/:errandId`. The screen switches to the ended state
/// at the earlier of `offerExpiresAt` and `deadlineAt` (no countdown and no
/// client switch when both are null, row 156) or when the server no longer
/// returns the offer.
class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.errandId, this.initial});

  final String errandId;
  final RunnerJobView? initial;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  late RunnerJobView? _job = widget.initial;
  RunnerMe? _me;
  DevicePosition? _fix;
  bool _ended = false;
  bool _accepting = false;
  Object? _error;
  Timer? _ticker;

  AppServices get _s => AppScope.read(context);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final s = _s;
    try {
      final me = await s.account.me();
      if (mounted) setState(() => _me = me);
      if (me.isOnline || me.isBusy) {
        try {
          final fix = await s.location.current();
          if (mounted) setState(() => _fix = fix);
        } on Object {
          // No distance without a fix.
        }
      }
    } on Object {
      // Buttons need the runner's state; keep them hidden until known.
    }
    try {
      final job = await s.jobs.job(widget.errandId);
      if (!mounted) return;
      if (!job.isOpenOffer) {
        // Opened from a stale notification: a job this runner holds goes
        // to v-active, anything else is an ended offer.
        if (job.assignment.status == AssignmentStatus.accepted) {
          Nav.toShellTab(context, RunnerTab.active);
          return;
        }
        setState(() => _ended = true);
        return;
      }
      setState(() {
        _job = job;
        _error = null;
      });
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 403 || e.statusCode == 404) {
        setState(() => _ended = true);
      } else if (_job == null) {
        setState(() => _error = e);
      }
    } on Object catch (e) {
      if (mounted && _job == null) setState(() => _error = e);
    }
    _startTicker();
  }

  void _startTicker() {
    _ticker?.cancel();
    final job = _job;
    if (job == null || job.offerEndsAt == null || _ended) return;
    _tick();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    final job = _job;
    if (!mounted || job == null) return;
    if (job.offerEndedAt(_s.clock())) {
      _ticker?.cancel();
      setState(() => _ended = true);
    } else {
      setState(() {});
    }
  }

  Future<void> _accept(RunnerJobView job) async {
    final gate = await ensureLocationPermission(context);
    if (!mounted) return;
    if (gate != LocationGateResult.granted) {
      showSnack(context, JobsCopy.locationOff);
      return;
    }
    setState(() => _accepting = true);
    try {
      await _s.jobs.accept(job.id);
      if (!mounted) return;
      Nav.toShellTab(context, RunnerTab.active);
    } on Object catch (e) {
      if (!mounted) return;
      final f = acceptFailure(e, busyMessage: OfferCopy.busyDetail);
      if (f.offerGone) setState(() => _ended = true);
      if (f.message != null) showSnack(context, f.message!);
      if (f.reload) unawaited(_load());
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  Future<void> _decline(RunnerJobView job) async {
    final outcome = await declineOffer(context, _s.jobs, job);
    if (!mounted) return;
    switch (outcome) {
      case DeclineReasonOutcome.declined:
        Navigator.of(context).pop(JobDetailOutcome.declined);
      case DeclineReasonOutcome.offerUnavailable:
        Navigator.of(context).pop(JobDetailOutcome.unavailable);
      case DeclineReasonOutcome.kept:
        break;
    }
  }

  ErrandLocation? _point(RunnerJobView job, ErrandPointType type) {
    for (final l in job.locations) {
      if (l.pointType == type) return l;
    }
    return null;
  }

  Widget _items(RunnerJobView job) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel(JobDetailCopy.items, padding: EdgeInsets.zero),
        const SizedBox(height: 6),
        for (final item in job.items)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      if (item.quantity != null) ...[
                        NumSpan('${item.quantity}'),
                        const TextSpan(text: ' × '),
                      ],
                      TextSpan(text: item.name),
                      if (item.unit != null) TextSpan(text: ' ${item.unit}'),
                    ],
                  ),
                  style: NitumeTextStyles.body.copyWith(fontSize: 13),
                ),
                if (item.notes != null)
                  Text(item.notes!, style: NitumeTextStyles.mutedSmall),
              ],
            ),
          ),
        const SizedBox(height: 4),
      ],
    );
  }

  Widget _card(RunnerJobView job) {
    final km = offerDistanceKm(job, _fix);
    final deadline = job.deadlineAt;
    final item = job.itemAmount;
    final paid = howItsPaid(job);
    final pickup = _point(job, ErrandPointType.pickup);
    final dropoff = _point(job, ErrandPointType.dropoff);
    final site = _point(job, ErrandPointType.taskSite);
    return NitumeCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(child: NitumeTag(job.category.label)),
              const SizedBox(width: 10),
              const Spacer(),
              NumText.kes(job.runnerFee, fontSize: 17),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            offerTitle(job),
            style: NitumeTextStyles.rowTitle.copyWith(fontSize: 14),
          ),
          const SizedBox(height: 4),
          if (job.description.isNotEmpty) ...[
            Text(
              job.description,
              style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
            ),
            const SizedBox(height: 10),
          ],
          if (job.items.isNotEmpty) _items(job),
          InfoRowList(
            rows: [
              km == null
                  ? const InfoRow(
                      label: JobDetailCopy.distance,
                      value: OfferCopy.distanceUnavailable,
                    )
                  : InfoRow.numeric(
                      label: JobDetailCopy.distance,
                      value: formatDistanceKm(km),
                    ),
              if (deadline != null)
                InfoRow.numeric(
                  label: JobDetailCopy.deadline,
                  value: formatDayTimeEat(deadline, now: _s.clock()),
                ),
              InfoRow.numeric(
                label: JobDetailCopy.payout,
                value: formatKes(job.runnerFee),
              ),
              if (item != null)
                InfoRow.numeric(
                  label: JobDetailCopy.itemAmount,
                  value: formatKes(item),
                ),
              if (item != null && paid != null)
                InfoRow(label: JobDetailCopy.howItsPaid, value: paid),
              if (pickup != null)
                InfoRow(label: JobDetailCopy.pickup, value: pickup.addressText),
              if (dropoff != null)
                InfoRow(
                  label: JobDetailCopy.dropoff,
                  value: dropoff.addressText,
                ),
              if (site != null)
                InfoRow(
                  label: JobDetailCopy.taskLocation,
                  value: site.addressText,
                ),
            ],
          ),
        ],
      ),
    );
  }

  NitumeNotice _limitNotice(RunnerJobView job) {
    final purchase = formatKes(job.requiredPurchase);
    final limit = formatKes(job.maxPurchaseAdvance);
    const tail = ". You can decline it. It won't count against you.";
    return NitumeNotice(
      message:
          'This job needs a purchase of $purchase, above your limit of '
          '$limit$tail',
      richMessage: TextSpan(
        children: [
          const TextSpan(text: 'This job needs a purchase of '),
          NumSpan(purchase),
          const TextSpan(text: ', above your limit of '),
          NumSpan(limit),
          const TextSpan(text: tail),
        ],
      ),
    );
  }

  Widget? _countdown(RunnerJobView job) {
    if (_ended) return null;
    final left = job.offerTimeLeftAt(_s.clock());
    if (left == null) return null;
    final text = formatCountdown(left);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: JobDetailCopy.endsInLead),
            TextSpan(text: text),
          ],
        ),
        key: const ValueKey('offer-countdown'),
        style: NitumeTextStyles.meta,
      ),
    );
  }

  Widget _actions(RunnerJobView? job) {
    final me = _me;
    if (_ended) {
      return NitumeFixedCta(
        above: const NitumeNotice(message: JobDetailCopy.ended),
        child: NitumeButton.outline(
          label: JobDetailCopy.backToJobs,
          expand: true,
          onPressed: () => Navigator.of(context).pop(JobDetailOutcome.ended),
        ),
      );
    }
    if (job == null || me == null) return const SizedBox.shrink();
    if (!me.isVerified || !(me.isOnline || me.isBusy)) {
      return NitumeFixedCta(
        child: NitumeNotice(
          message: me.isVerified
              ? JobDetailCopy.goOnline
              : JobsCopy.notVerifiedSwitch,
        ),
      );
    }
    final overLimit = job.overPurchaseLimit;
    return NitumeFixedCta(
      above: overLimit
          ? Text(
              JobDetailCopy.aboveLimitCaption,
              textAlign: TextAlign.end,
              style: NitumeTextStyles.mutedSmall,
            )
          : null,
      child: Row(
        children: [
          Expanded(
            child: NitumeButton.outline(
              label: JobDetailCopy.decline,
              expand: true,
              onPressed: _accepting ? null : () => _decline(job),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: MergeSemantics(
              child: Semantics(
                hint: overLimit ? JobDetailCopy.aboveLimitCaption : null,
                child: NitumeButton.primary(
                  label: JobDetailCopy.accept,
                  expand: true,
                  loading: _accepting,
                  onPressed: overLimit ? null : () => _accept(job),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    final Widget body;
    if (job == null && _error != null) {
      body = NitumeErrorState(
        message: JobsCopy.loadError,
        onRetry: () {
          setState(() => _error = null);
          _load();
        },
      );
    } else if (job == null) {
      body = const Padding(
        padding: EdgeInsets.symmetric(horizontal: 20),
        child: SkeletonCard(height: 190),
      );
    } else {
      final first = firstPointOf(job);
      final drop = _point(job, ErrandPointType.dropoff);
      final fix = _fix;
      final countdown = _countdown(job);
      body = ListView(
        padding: const EdgeInsets.only(bottom: 16),
        children: [
          ?countdown,
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: JobRouteMap(
              config: _s.appConfig,
              taskPoint: first?.point,
              dropoff: identical(drop, first) ? null : drop?.point,
              self: fix == null ? null : GeoPoint(lat: fix.lat, lng: fix.lng),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: _card(job),
          ),
          if (job.overPurchaseLimit)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: _limitNotice(job),
            ),
          if (job.merchantRoute == MerchantRoute.sendToRunner)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                JobDetailCopy.reimbursement,
                style: NitumeTextStyles.mutedSmall,
              ),
            ),
        ],
      );
    }
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: const NitumePushedHeader(title: JobDetailCopy.title),
      body: body,
      bottomNavigationBar: _actions(job),
    );
  }
}
