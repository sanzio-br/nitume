import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
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

  @override
  void initState() {
    super.initState();
    _services.shell.addListener(_onShell);
    _fast = Poller(
      interval: const Duration(seconds: 10),
      enabled: _services.pollingEnabled,
      isVisible: _visible,
      onTick: _refreshTracking,
    );
    _slow = Poller(
      interval: const Duration(seconds: 15),
      enabled: _services.pollingEnabled,
      isVisible: _visible,
      onTick: _refreshSelected,
    );
    if (widget.active) _load();
  }

  @override
  void didUpdateWidget(TrackTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _load();
  }

  @override
  void dispose() {
    _services.shell.removeListener(_onShell);
    _fast?.dispose();
    _slow?.dispose();
    _runner.dispose();
    super.dispose();
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
      _services.priceChanges
          .pending(id)
          .then<Object?>((v) => v, onError: (_) => null),
      _services.payments
          .forErrand(id)
          .then<Object?>((v) => v, onError: (_) => null),
    ]);
    final tracking = results[0] as TrackingSnapshot?;
    _runner.value = tracking?.runnerLocation?.point;
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
    final t = await _services.errands.tracking(id);
    if (!mounted || id != _selectedId) return;
    // Only the marker moves; the map is not rebuilt.
    _runner.value = t.runnerLocation?.point;
    if (t.eta != _detail?.tracking?.eta) {
      setState(() => _detail?.tracking = t);
    } else {
      _detail?.tracking = t;
    }
  }

  Future<void> _refreshSelected() async {
    final id = _selectedId;
    if (id == null) return;
    final d = await _loadDetail(id);
    if (!mounted || id != _selectedId) return;
    final hadPriceChange = _detail?.priceChange?.id;
    setState(() => _detail = d);
    // A new pending price change opens the blocking modal (OA-8).
    if (d.priceChange != null && d.priceChange!.id != hadPriceChange) {
      _openPriceChange();
    }
  }

  Future<void> _select(String id) async {
    setState(() {
      _selectedId = id;
      _detail = null;
    });
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
    required this.onPriceChange,
  });

  final _Detail detail;
  final ValueNotifier<GeoPoint?> runner;
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
    final eta = status == ErrandStatus.arrived
        ? 'Arrived'
        : (tracking?.eta == null || finding ? null : formatEta(tracking!.eta!));
    final points = tracking?.points ?? errand.locations ?? const [];
    final mp = detail.payment?.merchantPayment;
    final itemDue =
        mp != null &&
        isPositiveAmount(mp.amount) &&
        (mp.route == MerchantRoute.sendToRunner || mp.hasMerchantDetails);
    final r = errand.runner ?? tracking?.runner;

    final actions = <Widget>[
      if (detail.priceChange != null)
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
              LiveTrackingMap(
                etaLabel: eta,
                semanticLabel: 'Map of your task',
                mapBuilder: (_) => SchematicMap(
                  points: finding
                      ? [
                          for (final p in points)
                            if (p.pointType != ErrandPointType.pickup) p,
                        ]
                      : points,
                  runner: runner,
                ),
              ),
              ValueListenableBuilder<GeoPoint?>(
                valueListenable: runner,
                builder: (context, pos, _) => pos != null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Live location appears when your runner is on the '
                          'way.',
                          style: NitumeTextStyles.muted.copyWith(fontSize: 12),
                        ),
                      ),
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
        if (itemDue)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: NitumeNotice(
              message: 'Pay the item amount: ${formatKes(mp.amount)}',
              richMessage: TextSpan(
                children: [
                  const TextSpan(text: 'Pay the item amount: '),
                  NumSpan.kes(mp.amount),
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
