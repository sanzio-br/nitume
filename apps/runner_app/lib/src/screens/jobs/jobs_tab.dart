import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/job_start_notice.dart';
import '../../services/location_gate.dart';
import '../../services/runner_live.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import 'offer_presentation.dart';

/// `v-jobs` copy (`docs/specs/runner/v-jobs.md`).
abstract final class JobsCopy {
  static const title = 'Nearby jobs';
  static const noAreas = 'No service areas yet';
  static const notVerifiedSwitch =
      'You can go online once your verification is approved.';
  static const verifyTitle = 'Finish your verification';
  static const verifyReviewing =
      "We're reviewing your documents. We'll notify you when you're approved.";
  static const verifyRejected =
      "Some checks weren't approved. Fix them to start accepting jobs.";
  static const verifyNotStarted =
      'Upload your ID and a selfie to start accepting jobs.';
  static const viewStatus = 'View status';
  static const continueVerification = 'Continue verification';
  static const offlineTitle = "You're offline";
  static const offlineBody =
      'Go online to get job offers near your service areas.';
  static const offlineOffers = 'Go online to accept this offer.';
  static const emptyTitle = 'No offers right now';
  static const emptyBody =
      "We'll notify you when a job near you comes in. Keep the app online.";
  static const loadError = "Couldn't load offers.";
  static const activeJob = 'You have an active job';
  static const busyOffline = 'Finish your active job before going offline.';
  static const locationOff = 'Turn on location to receive and do jobs.';
  static const openSettings = 'Open Settings';
  static const newOffer = 'New job offer';

  /// C-40 under the availability card after the socket is down 5 s.
  static const reconnecting = 'Reconnecting…';

  /// `3 offers near you` / `1 offer near you` (the count is a Fira Code
  /// prefix).
  static String offersLabel(int n) =>
      n == 1 ? 'offer near you' : 'offers near you';
}

/// Job states that keep a job on `v-active` (`_shared.md` §6). Only the
/// first three make the runner busy (row 211).
const _activeSet = {
  ErrandStatus.runnerEnRoute,
  ErrandStatus.arrived,
  ErrandStatus.inProgress,
  ErrandStatus.awaitingCustomer,
  ErrandStatus.disputed,
};

enum _VerifyState { reviewing, rejected, notStarted }

/// Where the verification card's button goes.
enum _VerifyTarget { pending, id, selfie }

/// `v-jobs` root tab: availability, the runner's open offers, accept and
/// decline (rows 113, 210, 211, 215, 229).
///
/// Offers arrive live from the runner room (`job:offered`,
/// `job:offer_withdrawn`, RA-5); the 20 s poll runs only while the socket
/// is not connected (`_shared.md` §10 fallback), and a reconnect reloads
/// once. A card is removed at the
/// earlier of `offerExpiresAt` and `deadlineAt` (rows 185, 205), never when
/// both are null (row 156).
class JobsTab extends StatefulWidget {
  const JobsTab({super.key});

  /// Polling interval without the socket (`_shared.md` §10).
  static const pollInterval = Duration(seconds: 20);

  @override
  State<JobsTab> createState() => _JobsTabState();
}

class _JobsTabState extends State<JobsTab> with WidgetsBindingObserver {
  RunnerMe? _me;
  List<RunnerJobView> _offers = const [];
  Errand? _activeJob;
  DevicePosition? _fix;
  int _unread = 0;
  bool _loading = true;
  Object? _error;
  bool _toggling = false;
  String? _acceptingId;

  /// Last location refusal (`null` when none): notice under the card.
  LocationGateResult? _locationRefusal;

  Timer? _poll;
  Timer? _offerEnd;
  bool _foreground = true;
  ShellController? _shell;
  RunnerLive? _live;
  bool _wasConnected = false;
  Timer? _downTimer;
  bool _reconnecting = false;

  /// One silent reload after offers are withdrawn (RN-L1 F-5), coalesced.
  Timer? _withdrawReload;

  /// How long withdrawals are gathered before the single reload.
  static const _withdrawReloadDelay = Duration(milliseconds: 500);

  /// How long the socket may be down before `Reconnecting…` shows.
  static const _reconnectGrace = Duration(seconds: 5);
  final _subs = <StreamSubscription<Object?>>[];

  AppServices get _s => AppScope.read(context);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _shell = _s.shell..addListener(_syncPolling);
      final live = _live = _s.live;
      _wasConnected = live.isConnected;
      live.state.addListener(_onSocket);
      _syncReconnecting();
      _subs.addAll([
        live.jobOffers.listen(_onOffered),
        live.jobOfferWithdrawals.listen(_onWithdrawn),
      ]);
      _load();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _shell?.removeListener(_syncPolling);
    _live?.state.removeListener(_onSocket);
    for (final sub in _subs) {
      sub.cancel();
    }
    _poll?.cancel();
    _offerEnd?.cancel();
    _downTimer?.cancel();
    _withdrawReload?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final fg = state == AppLifecycleState.resumed;
    if (fg == _foreground) return;
    _foreground = fg;
    if (fg) _load(silent: true);
    _syncPolling();
  }

  bool get _visible => _foreground && _shell?.tab == RunnerTab.jobs;

  void _onSocket() {
    final now = _live?.isConnected ?? false;
    _syncReconnecting();
    // Back online: one reload replaces what the socket may have missed.
    if (now && !_wasConnected) _load(silent: true);
    _wasConnected = now;
    _syncPolling();
  }

  /// Trying to connect (connecting / reconnecting) for 5 s shows the
  /// notice; connected or deliberately disconnected hides it.
  void _syncReconnecting() {
    final state = _live?.state.value;
    final trying =
        state == RealtimeConnectionState.connecting ||
        state == RealtimeConnectionState.reconnecting;
    if (!trying) {
      _downTimer?.cancel();
      _downTimer = null;
      if (_reconnecting && mounted) setState(() => _reconnecting = false);
      return;
    }
    _downTimer ??= Timer(_reconnectGrace, () {
      if (mounted) setState(() => _reconnecting = true);
    });
  }

  /// `job:offered`: fetch the card and add it (newest first).
  Future<void> _onOffered(JobOffered e) async {
    final me = _me;
    if (me == null || !me.isVerified) return;
    if (_offers.any((o) => o.id == e.errandId)) return;
    try {
      final job = await _s.jobs.job(e.errandId);
      if (!mounted || !job.isOpenOffer || job.offerEndedAt(_s.clock())) return;
      if (_offers.any((o) => o.id == job.id)) return;
      setState(() => _offers = [job, ..._offers]);
      _armOfferEnd();
      SemanticsService.sendAnnouncement(
        View.of(context),
        JobsCopy.newOffer,
        TextDirection.ltr,
      );
    } on Object {
      // The next reload shows it if it is still open.
    }
  }

  /// `job:offer_withdrawn`: the card goes with the usual snackbar.
  void _onWithdrawn(JobOfferWithdrawn e) {
    if (!mounted || !_offers.any((o) => o.id == e.errandId)) return;
    _remove(e.errandId);
    showSnack(context, OfferCopy.unavailable);
    // A runner who dropped out of verification (row 263 (a), 266) loses
    // every offer at once: reload once so the verification card and the
    // disabled switch show without a resume.
    _withdrawReload?.cancel();
    _withdrawReload = Timer(_withdrawReloadDelay, () {
      _withdrawReload = null;
      if (mounted) _load(silent: true);
    });
  }

  void _syncPolling() {
    final want =
        _visible &&
        (_me?.isVerified ?? false) &&
        !(_live?.isConnected ?? false);
    if (want && _poll == null) {
      _poll = Timer.periodic(JobsTab.pollInterval, (_) => _load(silent: true));
    } else if (!want) {
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && _me == null) setState(() => _loading = true);
    final s = _s;
    try {
      final me = await s.account.me();
      var offers = <RunnerJobView>[];
      Errand? active;
      DevicePosition? fix;
      if (me.isVerified) {
        offers = (await s.jobs.offers(
          limit: RunnerJobsRepository.maxOffersPageSize,
        )).items.where((o) => o.isOpenOffer).toList();
        try {
          active = (await s.jobs.activeJobs())
              .where((e) => _activeSet.contains(e.status))
              .firstOrNull;
        } on Object {
          active = _activeJob;
        }
        // Location only while online (row 123: nothing collected offline).
        if (me.isOnline || me.isBusy) {
          try {
            fix = await s.location.current();
          } on Object {
            fix = null;
          }
        }
      }
      var unread = _unread;
      try {
        unread = await s.notifications.unreadCount();
      } on Object {
        // Keep the last count.
      }
      if (!mounted) return;
      final before = {for (final o in _offers) o.id};
      final now = s.clock();
      final fresh = offers.where((o) => !o.offerEndedAt(now)).toList();
      // A shown card whose offer ended or was withdrawn (no longer
      // listed) goes with the usual snackbar.
      final freshIds = {for (final o in fresh) o.id};
      final endedShown = before.any((id) => !freshIds.contains(id));
      if (_me != null && fresh.any((o) => !before.contains(o.id))) {
        // Polite announcement, never a focus change.
        SemanticsService.sendAnnouncement(
          View.of(context),
          JobsCopy.newOffer,
          TextDirection.ltr,
        );
      }
      s.pings.setOnline(me.isOnline || me.isBusy);
      setState(() {
        _me = me;
        _offers = fresh;
        _activeJob = active;
        _fix = fix;
        _unread = unread;
        _error = null;
        _loading = false;
      });
      if (endedShown) showSnack(context, OfferCopy.unavailable);
      _armOfferEnd();
      _syncPolling();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        if (!silent || _me == null) _error = e;
        _loading = false;
      });
    }
  }

  /// Removes cards at the earliest offer end (client clock).
  void _armOfferEnd() {
    _offerEnd?.cancel();
    final now = _s.clock();
    DateTime? next;
    for (final o in _offers) {
      final end = o.offerEndsAt;
      if (end != null && (next == null || end.isBefore(next))) next = end;
    }
    if (next == null) return;
    final wait = next.difference(now);
    _offerEnd = Timer(wait.isNegative ? Duration.zero : wait, _dropEnded);
  }

  void _dropEnded() {
    if (!mounted) return;
    final now = _s.clock();
    final ended = _offers.where((o) => o.offerEndedAt(now)).toSet();
    if (ended.isNotEmpty) {
      setState(
        () => _offers = _offers.where((o) => !ended.contains(o)).toList(),
      );
      showSnack(context, OfferCopy.unavailable);
    }
    _armOfferEnd();
  }

  void _remove(String id) {
    setState(() => _offers = _offers.where((o) => o.id != id).toList());
    _armOfferEnd();
  }

  Future<void> _toggle(bool on) async {
    final me = _me;
    if (me == null || _toggling) return;
    if (!on && me.isBusy) {
      showSnack(context, JobsCopy.busyOffline);
      return;
    }
    if (on) {
      final gate = await ensureLocationPermission(context);
      if (!mounted) return;
      if (gate != LocationGateResult.granted) {
        setState(() => _locationRefusal = gate);
        return;
      }
    }
    setState(() {
      _toggling = true;
      _locationRefusal = null;
    });
    try {
      final next = await _s.account.setAvailability(
        on ? RunnerAvailability.online : RunnerAvailability.offline,
      );
      if (!mounted) return;
      _s.pings.setOnline(next.isOnline || next.isBusy);
      setState(() => _me = next);
      await _load(silent: true);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      if (e.code == ApiErrorCodes.runnerOnActiveJob) {
        showSnack(context, JobsCopy.busyOffline);
      } else if (e.code == ApiErrorCodes.runnerNotVerified) {
        await _load(silent: true);
      } else {
        showSnack(context, friendlyError(e));
      }
    } finally {
      if (mounted) setState(() => _toggling = false);
    }
  }

  Future<void> _accept(RunnerJobView o) async {
    if (_acceptingId != null) return;
    final gate = await ensureLocationPermission(context);
    if (!mounted) return;
    if (gate != LocationGateResult.granted) {
      setState(() => _locationRefusal = gate);
      return;
    }
    setState(() {
      _acceptingId = o.id;
      _locationRefusal = null;
    });
    try {
      await _s.jobs.accept(o.id);
      if (!mounted) return;
      _remove(o.id);
      // Accepting is RUNNER_ASSIGNED → RUNNER_EN_ROUTE: the Active tab on
      // that job.
      _s.shell.showJob(o.id);
      _s.active.accepted(o.id);
      showJobStartNotice(Navigator.of(context, rootNavigator: true), _s);
      unawaited(_load(silent: true));
    } on Object catch (e) {
      if (!mounted) return;
      final f = acceptFailure(e, busyMessage: OfferCopy.busyJobs);
      if (f.offerGone) _remove(o.id);
      if (f.message != null) showSnack(context, f.message!);
      if (f.reload) unawaited(_load(silent: true));
    } finally {
      if (mounted) setState(() => _acceptingId = null);
    }
  }

  Future<void> _decline(RunnerJobView o) async {
    final outcome = await declineOffer(context, _s.jobs, o);
    if (!mounted) return;
    switch (outcome) {
      case DeclineReasonOutcome.declined:
        _remove(o.id);
      case DeclineReasonOutcome.offerUnavailable:
        _remove(o.id);
        showSnack(context, DeclineReasonCopy.offerUnavailable);
      case DeclineReasonOutcome.kept:
        break;
    }
  }

  Future<void> _openDetail(RunnerJobView o) async {
    final outcome = await Nav.toJobDetail(context, o);
    if (!mounted) return;
    switch (outcome) {
      case JobDetailOutcome.declined || JobDetailOutcome.ended:
        _remove(o.id);
      case JobDetailOutcome.unavailable:
        _remove(o.id);
        showSnack(context, OfferCopy.unavailable);
      case null:
        unawaited(_load(silent: true));
    }
  }

  /// An ID side or the selfie not submitted yet → that capture screen.
  _VerifyTarget _verifyTarget(RunnerVerificationSummary v) {
    bool missing(RunnerVerificationType t, [VerificationDocumentSide? side]) {
      final c = v.checkFor(t, side: side);
      return c == null || c.status == VerificationCheckStatus.missing;
    }

    if (missing(
          RunnerVerificationType.governmentId,
          VerificationDocumentSide.front,
        ) ||
        missing(
          RunnerVerificationType.governmentId,
          VerificationDocumentSide.back,
        )) {
      return _VerifyTarget.id;
    }
    if (missing(RunnerVerificationType.selfie)) return _VerifyTarget.selfie;
    return _VerifyTarget.pending;
  }

  _VerifyState _verifyState(RunnerVerificationSummary v) {
    if (v.checks.any((c) => c.status == VerificationCheckStatus.rejected)) {
      return _VerifyState.rejected;
    }
    if (_verifyTarget(v) != _VerifyTarget.pending) {
      return _VerifyState.notStarted;
    }
    return _VerifyState.reviewing;
  }

  Future<void> _openVerification(RunnerVerificationSummary v) async {
    final target = _verifyState(v) == _VerifyState.notStarted
        ? _verifyTarget(v)
        : _VerifyTarget.pending;
    switch (target) {
      case _VerifyTarget.id:
        await Nav.toOnboardId(context);
      case _VerifyTarget.selfie:
        await Nav.toOnboardSelfie(context);
      case _VerifyTarget.pending:
        await Nav.toOnboardPending(context);
    }
    if (mounted) unawaited(_load(silent: true));
  }

  Widget _verificationCard(RunnerVerificationSummary v) {
    final state = _verifyState(v);
    return NitumeCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            JobsCopy.verifyTitle,
            style: NitumeTextStyles.cardTitle.copyWith(fontSize: 15),
          ),
          const SizedBox(height: 6),
          Text(switch (state) {
            _VerifyState.reviewing => JobsCopy.verifyReviewing,
            _VerifyState.rejected => JobsCopy.verifyRejected,
            _VerifyState.notStarted => JobsCopy.verifyNotStarted,
          }, style: NitumeTextStyles.muted.copyWith(fontSize: 13)),
          const SizedBox(height: 14),
          NitumeButton.primary(
            label: state == _VerifyState.notStarted
                ? JobsCopy.continueVerification
                : JobsCopy.viewStatus,
            onPressed: () => _openVerification(v),
          ),
        ],
      ),
    );
  }

  Widget _activeJobCard(Errand job) {
    final p = runnerStatusPresentation(job.status);
    return NitumeCard(
      onTap: () => _s.shell.showJob(job.id),
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(JobsCopy.activeJob, style: NitumeTextStyles.rowTitle),
                const SizedBox(height: 2),
                Text(
                  job.title ?? job.category.label,
                  style: NitumeTextStyles.muted.copyWith(fontSize: 13),
                ),
              ],
            ),
          ),
          if (p != null) ...[
            const SizedBox(width: 10),
            StatusChip(
              label: p.label,
              tone: p.tone,
              size: StatusChipSize.compact,
            ),
          ],
        ],
      ),
    );
  }

  Widget _locationNotice() {
    final blocked = _locationRefusal == LocationGateResult.blocked;
    return NitumeNotice(
      message: JobsCopy.locationOff,
      action: blocked
          ? NitumeButton.outline(
              label: JobsCopy.openSettings,
              size: NitumeButtonSize.small,
              onPressed: () => _s.permissions.openSettings(),
            )
          : null,
    );
  }

  Widget _offerCard(RunnerJobView o) {
    final busy = _acceptingId != null;
    return JobOfferCard(
      key: ValueKey('offer-${o.id}'),
      category: o.category.label,
      payAmount: o.runnerFee,
      title: offerTitle(o),
      meta: offerMeta(o, _fix),
      richMeta: offerRichMeta(o, _fix),
      notice: o.overPurchaseLimit ? cardLimitNotice(o) : null,
      accepting: _acceptingId == o.id,
      onTap: () => _openDetail(o),
      // Accept is refused above the limit (row 113): disabled.
      onAccept: o.overPurchaseLimit || busy ? null : () => _accept(o),
      onDecline: busy ? null : () => _decline(o),
    );
  }

  List<Widget> _body(RunnerMe me) {
    const pad = EdgeInsets.fromLTRB(20, 0, 20, 12);
    final online = me.isOnline || me.isBusy;
    final areas = me.serviceAreas.isEmpty
        ? JobsCopy.noAreas
        : me.serviceAreas.map((a) => a.name).join(' · ');
    final out = <Widget>[
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: AvailabilityCard(
          online: online,
          areas: areas,
          disabledReason: me.isVerified ? null : JobsCopy.notVerifiedSwitch,
          onChanged: me.isVerified && !_toggling ? _toggle : null,
        ),
      ),
      if (_reconnecting)
        const Padding(
          padding: pad,
          child: NitumeNotice(message: JobsCopy.reconnecting),
        ),
      if (_locationRefusal != null)
        Padding(padding: pad, child: _locationNotice()),
    ];
    if (!me.isVerified) {
      out.add(Padding(padding: pad, child: _verificationCard(me.verification)));
      return out;
    }
    final active = _activeJob;
    if (active != null) {
      out.add(Padding(padding: pad, child: _activeJobCard(active)));
    }
    if (_offers.isEmpty) {
      out.add(
        NitumeEmptyState(
          title: online ? JobsCopy.emptyTitle : JobsCopy.offlineTitle,
          message: online ? JobsCopy.emptyBody : JobsCopy.offlineBody,
        ),
      );
      return out;
    }
    if (!online) {
      // Row 215: an admin may offer a task to an offline runner.
      out.add(
        const Padding(
          padding: pad,
          child: NitumeNotice(message: JobsCopy.offlineOffers),
        ),
      );
    }
    out.add(
      SectionLabel(
        JobsCopy.offersLabel(_offers.length),
        numericPrefix: '${_offers.length}',
      ),
    );
    for (final o in _offers) {
      out.add(Padding(padding: pad, child: _offerCard(o)));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final List<Widget> content;
    if (_loading && me == null) {
      content = const [
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: SkeletonCard(height: 120),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: SkeletonCard(height: 120),
        ),
      ];
    } else if (me == null || _error != null) {
      content = [NitumeErrorState(message: JobsCopy.loadError, onRetry: _load)];
    } else {
      content = _body(me);
    }
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () => _load(silent: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            NitumeTopBar(
              title: JobsCopy.title,
              actions: [
                NotificationBell(
                  unreadCount: _unread,
                  // TODO(flutter-runner): open v-notifications once built.
                  onPressed: () {},
                ),
              ],
            ),
            ...content,
          ],
        ),
      ),
    );
  }
}
