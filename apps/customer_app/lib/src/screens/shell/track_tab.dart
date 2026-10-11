import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/live_updates.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import '../../widgets/schematic_map.dart';
import '../checkout/price_change_dialog.dart';

/// States shown on Track (`v-track`).
const trackStatuses = {
  ErrandStatus.paymentConfirmed,
  ErrandStatus.runnerAssigned,
  ErrandStatus.runnerEnRoute,
  ErrandStatus.arrived,
  ErrandStatus.inProgress,
  ErrandStatus.awaitingCustomer,
};

/// Runner marker and ETA window (rows 27, 65; `_shared.md` §10).
const runnerWindow = {
  ErrandStatus.runnerAssigned,
  ErrandStatus.runnerEnRoute,
  ErrandStatus.arrived,
  ErrandStatus.inProgress,
};

/// Happy path used for the "next expected" timeline step (v-track Q1).
const _happyPath = [
  ErrandStatus.paymentConfirmed,
  ErrandStatus.runnerAssigned,
  ErrandStatus.runnerEnRoute,
  ErrandStatus.arrived,
  ErrandStatus.inProgress,
  ErrandStatus.awaitingCustomer,
  ErrandStatus.completed,
];

class _Detail {
  _Detail({
    required this.errand,
    required this.tracking,
    required this.history,
    required this.evidence,
    required this.priceChange,
    required this.payment,
  });

  Errand errand;
  TrackingSnapshot? tracking;
  List<StatusHistoryEntry> history;
  List<Evidence> evidence;
  PriceChangeRequest? priceChange;
  PaymentSummary? payment;
}

/// `v-track`: live tracking of the selected errand. Without an approved
/// socket client (row 29) it polls the tracking snapshot every 10 s and
/// the errand every 15 s while visible.
class TrackTab extends StatefulWidget {
  const TrackTab({super.key, required this.active});

  final bool active;

  @override
  State<TrackTab> createState() => _TrackTabState();
}

class _TrackTabState extends State<TrackTab> with ReloadOnReturn<TrackTab> {
  late final AppServices _services = context.services;
  final _runner = ValueNotifier<GeoPoint?>(null);
  final _eta = ValueNotifier<Duration?>(null);
  ErrandWatch? _watch;
  List<Errand> _errands = const [];
  String? _selectedId;
  _Detail? _detail;
  Object? _error;
  bool _loading = true;
  int _unread = 0;
  Poller? _fast;
  Poller? _slow;

  @override
  RouteObserver<ModalRoute<void>> get routeObserver => _services.routeObserver;

  bool _visible() => widget.active && mounted && isRouteVisible(context);

  /// Polling runs only while the socket is down (§10).
  bool _shouldPoll() => _visible() && !_services.live.isConnected;

  @override
  void initState() {
    super.initState();
    _services.shell.addListener(_onShell);
    _fast = Poller(
      interval: const Duration(seconds: 10),
      enabled: _services.pollingEnabled,
      isVisible: _shouldPoll,
      onTick: _refreshTracking,
    );
    _slow = Poller(
      interval: const Duration(seconds: 15),
      enabled: _services.pollingEnabled,
      isVisible: _shouldPoll,
      onTick: _refreshSelected,
    );
    if (widget.active) _load();
  }

  @override
  void didUpdateWidget(TrackTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _load();
    // Leave the room while the tab is hidden (§10).
    if (!widget.active && old.active) _watchSelected(null);
  }

  @override
  void dispose() {
    _services.shell.removeListener(_onShell);
    _fast?.dispose();
    _slow?.dispose();
    _watch?.cancel();
    _runner.dispose();
    _eta.dispose();
    super.dispose();
  }

  /// Joins the selected errand's room; live events update the marker or
  /// refresh the errand, a reconnect refetches once.
  void _watchSelected(String? id) {
    if (_watch?.errandId == id) return;
    _watch?.cancel();
    _watch = id == null
        ? null
        : _services.live.watch(
            id,
            onLocation: (e) {
              if (!_inWindow()) return;
              _runner.value = e.point;
              if (e.eta != null) _eta.value = e.eta;
            },
            onStatus: (_) => _refreshSelected(autoOpen: false),
            onEvidence: (_) => _refreshSelected(autoOpen: false),
            // The app-level listener opens the modal; Track only refreshes.
            onPriceChange: (_) => _refreshSelected(autoOpen: false),
            // New Till/Paybill details can make an item amount due.
            onMerchantDetails: (_) => _refreshSelected(autoOpen: false),
            onReconnected: () => _refreshSelected(autoOpen: false),
            // No longer allowed to follow this errand (row 65): drop the
            // runner position at once and reload what is still visible.
            onAccessRevoked: () {
              _runner.value = null;
              _eta.value = null;
              _watch = null;
              _refreshSelected(autoOpen: false);
            },
          );
  }

  bool _inWindow() => runnerWindow.contains(_detail?.errand.status);

  /// Shows the runner only inside the assignment window; never keeps a
  /// position outside it.
  void _applyTracking(ErrandStatus status, TrackingSnapshot? t) {
    if (!runnerWindow.contains(status) || t == null) {
      _runner.value = null;
      _eta.value = null;
      return;
    }
    _runner.value = t.runnerLocation?.point;
    _eta.value = t.eta;
  }

  @override
  void onReturn() {
    if (widget.active) _refreshSelected();
  }

  void _onShell() {
    if (_services.shell.trackErrandId != null && widget.active) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    _services.notifications
        .unreadCount()
        .then((n) {
          if (mounted) setState(() => _unread = n);
        })
        .catchError((Object _) {});
    try {
      final page = await _services.errands.list(statuses: trackStatuses);
      final errands = page.items;
      final want = _services.shell.takeTrackErrandId() ?? _selectedId;
      String? id;
      if (want != null) {
        id = want;
      } else if (errands.isNotEmpty) {
        id = errands.first.id;
      }
      final detail = id == null ? null : await _loadDetail(id);
      if (!mounted) return;
      setState(() {
        _errands = errands;
        _selectedId = detail?.errand.id;
        _detail = detail;
        _loading = false;
      });
      _watchSelected(detail?.errand.id);
      if (_services.shell.takeOpenPriceChange() &&
          detail?.priceChange != null) {
        _openPriceChange();
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<_Detail> _loadDetail(String id) async {
    final errand = await _services.errands.get(id);
    final results = await Future.wait<Object?>([
      _services.errands
          .tracking(id)
          .then<Object?>((v) => v, onError: (_) => null),
      _services.errands
          .history(id)
          .then<Object?>((v) => v, onError: (_) => <StatusHistoryEntry>[]),
      _services.evidence
          .list(id)
          .then<Object?>((v) => v, onError: (_) => <Evidence>[]),
      // Requests exist only in IN_PROGRESS (row 49).
      if (errand.status == ErrandStatus.inProgress)
        _services.priceChanges
            .pending(id)
            .then<Object?>((v) => v, onError: (_) => null)
      else
        Future<Object?>.value(),
      _services.payments
          .forErrand(id)
          .then<Object?>((v) => v, onError: (_) => null),
    ]);
    final tracking = results[0] as TrackingSnapshot?;
    _applyTracking(errand.status, tracking);
    return _Detail(
      errand: errand,
      tracking: tracking,
      history: results[1]! as List<StatusHistoryEntry>,
      evidence: results[2]! as List<Evidence>,
      priceChange: results[3] as PriceChangeRequest?,
      payment: results[4] as PaymentSummary?,
    );
  }

  Future<void> _refreshTracking() async {
    final id = _selectedId;
    if (id == null) return;
    TrackingSnapshot? t;
    try {
      t = await _services.errands.tracking(id);
    } on NitumeApiException catch (e) {
      // 403/404: not the current assignment any more (row 65).
      if (e.statusCode != 403 && e.statusCode != 404) rethrow;
    }
    if (!mounted || id != _selectedId) return;
    // Only the marker moves; the map is not rebuilt.
    _detail?.tracking = t;
    _applyTracking(_detail?.errand.status ?? ErrandStatus.inProgress, t);
  }

  Future<void> _refreshSelected({bool autoOpen = true}) async {
    final id = _selectedId;
    if (id == null) return;
    final d = await _loadDetail(id);
    if (!mounted || id != _selectedId) return;
    final hadPriceChange = _detail?.priceChange?.id;
    setState(() => _detail = d);
    // While polling (socket down) a new pending price change opens the
    // blocking modal here; with the socket the app-level listener does.
    if (autoOpen &&
        d.priceChange != null &&
        d.priceChange!.id != hadPriceChange) {
      _openPriceChange();
    }
  }

  Future<void> _select(String id) async {
    setState(() {
      _selectedId = id;
      _detail = null;
    });
    _watchSelected(id);
    try {
      final d = await _loadDetail(id);
      if (mounted && id == _selectedId) setState(() => _detail = d);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _openPriceChange() async {
    final d = _detail;
    if (d == null) return;
    await showPriceChangeDialog(
      context,
      errand: d.errand,
      request: d.priceChange,
    );
    if (mounted) _refreshSelected();
  }

  @override
  Widget build(BuildContext context) {
    final Widget content;
    if (_loading && _detail == null) {
      content = const SkeletonList(count: 1, height: 220);
    } else if (_error != null && _detail == null) {
      content = NitumeErrorState(
        message: "Couldn't load your task.",
        onRetry: _load,
      );
    } else if (_detail == null) {
      content = NitumeEmptyState(
        message: 'No task in progress.',
        actionLabel: 'Start a new task',
        onAction: () => Nav.toNewTask(context),
      );
    } else {
      content = _TrackBody(
        detail: _detail!,
        runner: _runner,
        eta: _eta,
        live: _services.live,
        config: _services.appConfig,
        onPriceChange: _openPriceChange,
      );
    }
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            NitumeTopBar(
              title: 'Track task',
              actions: [
                NotificationBell(
                  unreadCount: _unread,
                  onPressed: () => Nav.toNotifications(context),
                ),
              ],
            ),
            if (_errands.length > 1)
              SizedBox(
                height: 48,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: _errands.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final e = _errands[i];
                    return NitumeChoiceChip(
                      label: errandTitle(e),
                      selected: e.id == _selectedId,
                      onSelected: () => _select(e.id),
                    );
                  },
                ),
              ),
            if (_errands.length > 1) const SizedBox(height: 12),
            content,
          ],
        ),
      ),
    );
  }
}

class _TrackBody extends StatelessWidget {
  const _TrackBody({
    required this.detail,
    required this.runner,
    required this.eta,
    required this.live,
    required this.config,
    required this.onPriceChange,
  });

  final _Detail detail;
  final ValueNotifier<GeoPoint?> runner;
  final ValueNotifier<Duration?> eta;
  final LiveUpdates live;
  final AppConfig config;
  final VoidCallback onPriceChange;

  static const _terminalCopy = {
    ErrandStatus.cancelled: 'This task was cancelled.',
    ErrandStatus.failed: "This task couldn't be completed.",
    ErrandStatus.expired: 'No runner was available in time.',
    ErrandStatus.disputed: "We're reviewing your report.",
  };

  @override
  Widget build(BuildContext context) {
    final errand = detail.errand;
    final status = errand.status;
    final terminal = _terminalCopy[status];
    if (terminal != null || !trackStatuses.contains(status)) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
        child: NitumeCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StatusChip.forStatus(status),
              const SizedBox(height: 10),
              Text(
                terminal ?? statusPresentation(status).label,
                style: NitumeTextStyles.muted,
              ),
              const SizedBox(height: 14),
              NitumeButton.outline(
                label: 'View task',
                size: NitumeButtonSize.small,
                onPressed: () => Nav.toTaskDetail(context, errand.id),
              ),
            ],
          ),
        ),
      );
    }

    final tracking = detail.tracking;
    final finding = status == ErrandStatus.paymentConfirmed;
    final inWindow = runnerWindow.contains(status);
    final allPoints = tracking?.points ?? errand.locations ?? const [];
    // PAYMENT_CONFIRMED: the task pin only.
    final points = finding
        ? [
            for (final p in allPoints)
              if (p.pointType != ErrandPointType.pickup) p,
          ]
        : allPoints;
    GeoPoint? pointOf(ErrandPointType type) {
      for (final p in points) {
        if (p.pointType == type) return p.point;
      }
      return null;
    }

    final start = pointOf(ErrandPointType.pickup);
    final end =
        pointOf(ErrandPointType.dropoff) ?? pointOf(ErrandPointType.taskSite);
    final itemDue = itemAmountDue(detail.payment);
    final due = itemDue ? itemAmountDueValue(detail.payment!) : null;
    final r = errand.runner ?? tracking?.runner;

    final actions = <Widget>[
      if (detail.priceChange != null && status == ErrandStatus.inProgress)
        NitumeButton.outline(
          label: 'Price change',
          icon: Icons.sell_outlined,
          size: NitumeButtonSize.small,
          onPressed: onPriceChange,
        ),
      if (status == ErrandStatus.awaitingCustomer)
        NitumeButton.outline(
          label: 'Review evidence',
          icon: Icons.fact_check_outlined,
          size: NitumeButtonSize.small,
          onPressed: () => Nav.toEvidenceConfirm(context, errand.id),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Only the runner marker and ETA listen to live updates; the
              // Google map animates the marker in place (§5).
              ListenableBuilder(
                listenable: Listenable.merge([runner, eta]),
                builder: (context, _) {
                  final pos = inWindow ? runner.value : null;
                  final String? etaLabel;
                  if (status == ErrandStatus.arrived) {
                    etaLabel = 'Arrived';
                  } else if (inWindow && eta.value != null) {
                    etaLabel = formatEta(eta.value!);
                  } else {
                    etaLabel = null;
                  }
                  return LiveTrackingMap(
                    etaLabel: etaLabel,
                    semanticLabel: 'Map of your task',
                    mapBuilder:
                        GoogleTrackingMap.builderFor(
                          config,
                          start: start,
                          end: end,
                          runner: pos,
                        ) ??
                        (_) => SchematicMap(points: points, runner: runner),
                  );
                },
              ),
              if (inWindow)
                ValueListenableBuilder<GeoPoint?>(
                  valueListenable: runner,
                  builder: (context, pos, _) => pos != null
                      ? const SizedBox.shrink()
                      : const _MapCaption(
                          'Live location appears when your runner is on the '
                          'way.',
                        ),
                ),
              ValueListenableBuilder<RealtimeConnectionState>(
                valueListenable: live.state,
                builder: (context, _, _) => live.isReconnecting
                    ? const _MapCaption('Reconnecting…')
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: NitumeCard(
            padding: const EdgeInsets.all(15),
            child: finding || r == null
                ? Row(
                    children: [
                      Expanded(
                        child: Text(
                          "We're finding a runner for your task.",
                          style: NitumeTextStyles.muted,
                        ),
                      ),
                      const SizedBox(width: 10),
                      StatusChip.forStatus(status),
                    ],
                  )
                : RunnerSummaryTile(
                    name: runnerShortName(r) ?? 'Your runner',
                    meta: runnerMeta(r),
                    trailing: StatusChip.forStatus(status),
                  ),
          ),
        ),
        if (due != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: NitumeNotice(
              message: 'Pay the item amount: ${formatKes(due)}',
              richMessage: TextSpan(
                children: [
                  const TextSpan(text: 'Pay the item amount: '),
                  NumSpan.kes(due),
                ],
              ),
              action: NitumeButton.outline(
                label: 'View details',
                size: NitumeButtonSize.small,
                onPressed: () => Nav.toMerchantPayment(context, errand.id),
              ),
            ),
          ),
        if (actions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Row(
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: actions[i]),
                ],
              ],
            ),
          ),
        const SectionLabel('Timeline'),
        StatusTimeline(
          steps: timelineSteps(detail.history, detail.evidence, status),
        ),
      ],
    );
  }
}

/// History rows the customer never sees: DRAFT, and the system-only
/// payout states CONFIRMED and SETTLED (owner row 35).
const _hiddenInTimeline = {
  ErrandStatus.draft,
  ErrandStatus.confirmed,
  ErrandStatus.settled,
};

class _MapCaption extends StatelessWidget {
  const _MapCaption(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Text(text, style: NitumeTextStyles.muted.copyWith(fontSize: 12)),
  );
}

/// True when an item amount is still due after the fees (Track notice):
/// a `merchant_direct` amount with merchant details, or an unpaid
/// price-change difference. `send_to_runner`'s original item amount is
/// part of the combined fee STK (row 76), so only differences remain.
bool itemAmountDue(PaymentSummary? s) {
  if (s == null || s.payment?.status != PaymentStatus.completed) return false;
  final mp = s.merchantPayment;
  if (mp != null &&
      mp.route == MerchantRoute.merchantDirect &&
      mp.hasMerchantDetails &&
      isPositiveAmount(mp.amount)) {
    return true;
  }
  return s.differencePayments.any(
    (d) =>
        d.payment.status != PaymentStatus.completed &&
        isPositiveAmount(d.amount),
  );
}

/// Amount shown in the Track notice for [itemAmountDue].
String? itemAmountDueValue(PaymentSummary s) {
  final mp = s.merchantPayment;
  if (mp != null && mp.route == MerchantRoute.merchantDirect) return mp.amount;
  for (final d in s.differencePayments) {
    if (d.payment.status != PaymentStatus.completed) return d.amount;
  }
  return null;
}

/// Status history with `_shared.md` §6 labels, evidence uploads, and the
/// next expected state as pending (v-track Q1 default).
List<TimelineStep> timelineSteps(
  List<StatusHistoryEntry> history,
  List<Evidence> evidence,
  ErrandStatus current,
) {
  final done =
      <(DateTime?, TimelineStep)>[
        for (final h in history)
          if (!_hiddenInTimeline.contains(h.toStatus))
            (
              h.createdAt,
              TimelineStep(
                title: statusPresentation(h.toStatus).label,
                time: h.createdAt == null ? null : formatClock(h.createdAt!),
                done: true,
              ),
            ),
        for (final e in evidence)
          (
            e.capturedAt ?? e.createdAt,
            TimelineStep(
              title: 'Evidence upload',
              time: (e.capturedAt ?? e.createdAt) == null
                  ? null
                  : formatClock((e.capturedAt ?? e.createdAt)!),
              done: true,
            ),
          ),
      ]..sort((a, b) {
        final x = a.$1, y = b.$1;
        if (x == null || y == null) return 0;
        return x.compareTo(y);
      });
  final steps = [for (final d in done) d.$2];
  final i = _happyPath.indexOf(current);
  if (i >= 0 && i + 1 < _happyPath.length) {
    steps.add(
      TimelineStep(
        title: statusPresentation(_happyPath[i + 1]).label,
        time: 'Pending',
      ),
    );
  }
  return steps;
}
