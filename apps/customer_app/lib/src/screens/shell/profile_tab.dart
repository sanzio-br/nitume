import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';

/// `v-profile`: identity summary and account rows. Recurring tasks are out
/// of MVP (OA-18); Support shows only when configured and openable (SQ-2).
class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key, required this.active});

  final bool active;

  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  late final AppServices _services = context.services;
  int? _count;
  bool _userError = false;

  @override
  void initState() {
    super.initState();
    if (widget.active) _load();
  }

  @override
  void didUpdateWidget(ProfileTab old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _load();
  }

  Future<void> _load() async {
    _services.errands.count().then(
      (n) {
        if (mounted) setState(() => _count = n);
      },
      onError: (Object _) {
        if (mounted) setState(() => _count = null);
      },
    );
    if (_services.session.user == null) await _retryUser();
  }

  Future<void> _retryUser() async {
    try {
      await _services.session.refreshUser();
      if (mounted) setState(() => _userError = false);
    } on Object {
      if (mounted) setState(() => _userError = true);
    }
  }

  Future<void> _logout() async {
    final ok = await showNitumeConfirmDialog(
      context,
      title: 'Log out of Nitume?',
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
    );
    if (ok) await _services.session.logout();
  }

  Future<void> _support(Uri uri) async {
    final ok = await _services.appConfig.open(uri);
    if (!ok && mounted) {
      showSnack(context, "Couldn't open support. Try again later.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final support = _services.appConfig.supportLink;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          const NitumeTopBar(title: 'Profile'),
          ListenableBuilder(
            listenable: session,
            builder: (context, _) => _Head(
              user: _userError ? null : session.user,
              count: _count,
              onRetry: _retryUser,
            ),
          ),
          _row('Saved addresses', () => Nav.toAddresses(context)),
          _row('Payment methods', () => Nav.toPaymentMethods(context)),
          _row('Notifications', () => Nav.toNotifications(context)),
          if (support != null) _row('Support', () => _support(support)),
          _row('Log out', _logout, destructive: true),
        ],
      ),
    );
  }

  Widget _row(String label, VoidCallback onTap, {bool destructive = false}) =>
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
        child: MenuRow(label: label, onTap: onTap, destructive: destructive),
      );
}

class _Head extends StatelessWidget {
  const _Head({required this.user, required this.count, required this.onRetry});

  final AppUser? user;
  final int? count;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final u = user;
    final name = u?.displayName?.trim();
    final since = u?.createdAt == null
        ? null
        : 'Customer since ${formatMonthYear(u!.createdAt!)}';
    final meta = [?since, if (count != null) '$count tasks'].join(' · ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        children: [
          InitialsAvatar.fromName(name, size: InitialsAvatarSize.large),
          if (u == null) ...[
            const SizedBox(height: 10),
            Text(
              "Couldn't load your profile.",
              style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
            ),
            NitumeButton.link(label: 'Try again', onPressed: onRetry),
          ] else ...[
            if (name != null && name.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(name, style: NitumeTextStyles.pushedTitle),
            ],
            if (meta.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(meta, style: NitumeTextStyles.metaLarge),
            ],
          ],
        ],
      ),
    );
  }
}
