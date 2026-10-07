import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../services/shell_controller.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';

class _HomeData {
  const _HomeData({required this.active, required this.recent});

  final List<Errand> active;
  final List<Errand> recent;
}

/// `v-home`: greeting, categories, the active task and recent tasks.
class HomeTab extends StatefulWidget {
  const HomeTab({super.key, required this.active});

  /// True while this root tab is showing.
  final bool active;

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> with ReloadOnReturn<HomeTab> {
  Future<_HomeData>? _future;
  int _unread = 0;
  Poller? _poller;

  late final AppServices _services = context.services;

  @override
  RouteObserver<ModalRoute<void>> get routeObserver => _services.routeObserver;

  @override
  void initState() {
    super.initState();
    _reload();
    _poller = Poller(
      interval: const Duration(seconds: 30),
      enabled: _services.pollingEnabled,
      isVisible: () => widget.active && mounted && isRouteVisible(context),
      onTick: () async => _reload(),
    );
  }

  @override
  void didUpdateWidget(HomeTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _reload();
  }

  @override
  void dispose() {
    _poller?.dispose();
    super.dispose();
  }

  @override
  void onReturn() => _reload();

  void _reload() {
    final future = _load();
    setState(() {
      _future = future;
    });
    _services.notifications
        .unreadCount()
        .then((n) {
          if (mounted) setState(() => _unread = n);
        })
        .catchError((Object _) {});
  }

  Future<_HomeData> _load() async {
    final results = await Future.wait([
      _services.errands.list(
        statuses: ErrandRepository.activeStatuses,
        limit: 5,
      ),
      _services.errands.list(
        statuses: ErrandRepository.finishedStatuses,
        limit: 2,
      ),
    ]);
    return _HomeData(active: results[0].items, recent: results[1].items);
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          _reload();
          await _future;
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            ListenableBuilder(
              listenable: session,
              builder: (context, _) => _TopBar(
                displayName: session.user?.displayName,
                unread: _unread,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 18),
              child: SearchEntryRow(
                placeholder: 'What do you need done?',
                onTap: () => Nav.toNewTask(context),
              ),
            ),
            const SectionLabel('Categories'),
            CategoryGrid(
              onSelected: (c) => Nav.toNewTask(context, category: c),
            ),
            FutureBuilder<_HomeData>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const _HomeSkeleton();
                }
                if (snap.hasError) {
                  return NitumeErrorState(
                    message: "Couldn't load your tasks.",
                    onRetry: _reload,
                  );
                }
                return _HomeTasks(data: snap.data!);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.displayName, required this.unread});

  final String? displayName;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final greeting = greetingFor(DateTime.now());
    final name = firstName(displayName);
    return NitumeTopBar(
      title: name ?? greeting,
      greeting: name == null ? null : greeting,
      actions: [
        NotificationBell(
          unreadCount: unread,
          onPressed: () => Nav.toNotifications(context),
        ),
        NameAvatar(
          name: displayName,
          semanticLabel: 'Profile',
          onTap: () => context.services.shell.select(ShellTab.profile),
        ),
      ],
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(top: 6),
      child: Column(
        children: [
          SkeletonList(count: 1, height: 140),
          SizedBox(height: 14),
          SkeletonList(count: 2),
        ],
      ),
    );
  }
}

class _HomeTasks extends StatelessWidget {
  const _HomeTasks({required this.data});

  final _HomeData data;

  @override
  Widget build(BuildContext context) {
    final active = data.active.isEmpty ? null : data.active.first;
    final more = data.active.length - 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (active != null) ...[
          const SectionLabel('In progress'),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: ActiveTaskCard(
              tagLabel: active.category.label,
              reference: errandReference(active),
              title: errandTitle(active),
              meta: activeCardMeta(active),
              actionLabel: activeCardAction(active.status),
              onAction: () => Nav.openForStatus(context, active),
            ),
          ),
          if (more > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: NitumeButton.link(
                  label: '+$more more in progress',
                  onPressed: () =>
                      context.services.shell.select(ShellTab.track),
                ),
              ),
            ),
        ],
        if (data.recent.isNotEmpty) ...[
          const SectionLabel('Recent'),
          for (final e in data.recent)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: TaskRow(
                title: errandTitle(e),
                meta: _when(e),
                trailing: StatusChip.forStatus(e.status),
                onTap: () => Nav.toTaskDetail(context, e.id),
              ),
            ),
        ],
      ],
    );
  }

  static String? _when(Errand e) {
    final t = e.updatedAt ?? e.createdAt;
    return t == null ? null : formatDayTime(t);
  }
}
