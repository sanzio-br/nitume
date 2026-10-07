import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

/// `v-history`: finished tasks, newest first, cursor-paginated.
class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key, required this.active});

  final bool active;

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab>
    with ReloadOnReturn<HistoryTab> {
  static const _pageSize = 20;
  late final AppServices _services = context.services;
  final _items = <Errand>[];

  /// Fees paid through Nitume per errand (service + runner fee only; the
  /// item amount is never added, `_shared.md` §8). `null` = unknown (—).
  final _amounts = <String, String?>{};
  String? _cursor;
  bool _loading = false;
  bool _loadingMore = false;
  bool _loaded = false;
  Object? _error;

  @override
  RouteObserver<ModalRoute<void>> get routeObserver => _services.routeObserver;

  @override
  void didUpdateWidget(HistoryTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _refresh();
  }

  @override
  void initState() {
    super.initState();
    if (widget.active) _refresh();
  }

  @override
  void onReturn() {
    if (widget.active) _refresh();
  }

  Future<void> _refresh() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _services.errands.list(
        statuses: ErrandRepository.finishedStatuses,
        limit: _pageSize,
      );
      await _loadAmounts(page.items);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _cursor = page.nextCursor;
        _loading = false;
        _loaded = true;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _more() async {
    final cursor = _cursor;
    if (cursor == null || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await _services.errands.list(
        statuses: ErrandRepository.finishedStatuses,
        limit: _pageSize,
        cursor: cursor,
      );
      await _loadAmounts(page.items);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _loadingMore = false;
      });
    } on Object {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// TODO(api-contract): the list item has no fee total, so each card
  /// reads `GET /payments/:errandId`.
  Future<void> _loadAmounts(List<Errand> errands) async {
    await Future.wait([
      for (final e in errands)
        if (!_amounts.containsKey(e.id))
          _services.payments.forErrand(e.id).then((s) {
            final p = s.payment;
            _amounts[e.id] = p == null || p.status != PaymentStatus.completed
                ? null
                : addDecimals(p.serviceFee, p.runnerFee);
          }, onError: (Object _) => _amounts[e.id] = null),
    ]);
  }

  String _meta(Errand e) {
    final t = e.createdAt ?? e.updatedAt;
    return [
      t == null ? kMissingValue : formatDayTime(t),
      runnerShortName(e.runner) ?? kMissingValue,
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final Widget list;
    if (!_loaded && _error == null) {
      list = const SkeletonList();
    } else if (_error != null && _items.isEmpty) {
      list = NitumeErrorState(
        message: "Couldn't load your history.",
        onRetry: _refresh,
      );
    } else if (_items.isEmpty) {
      list = NitumeEmptyState(
        message: 'No tasks yet.',
        actionLabel: 'Start a new task',
        onAction: () => Nav.toNewTask(context),
      );
    } else {
      list = Column(
        children: [
          for (final e in _items)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: TaskHistoryCard(
                title: errandTitle(e),
                status: StatusChip.forStatus(e.status),
                meta: _meta(e),
                amount: _amounts[e.id],
                onTap: () => Nav.toTaskDetail(context, e.id),
              ),
            ),
          if (_loadingMore)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
        ],
      );
    }
    return SafeArea(
      bottom: false,
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 300) _more();
          return false;
        },
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const NitumeTopBar(title: 'History'),
              list,
            ],
          ),
        ),
      ),
    );
  }
}
