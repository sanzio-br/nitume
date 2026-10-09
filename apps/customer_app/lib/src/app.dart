import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import 'navigation/nav.dart';
import 'navigation/routes.dart';
import 'screens/auth/name_capture_screen.dart';
import 'screens/auth/phone_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/shell/home_shell.dart';
import 'services/app_services.dart';
import 'services/session.dart';

/// Root widget. The home screen follows the session (`_shared.md` §1):
/// restoring → splash, signed out → `v-auth-phone`, no name →
/// `x-name-capture`, signed in → the shell. Every session change clears the
/// pushed stack.
class NitumeCustomerApp extends StatefulWidget {
  const NitumeCustomerApp({
    super.key,
    required this.services,
    this.restoreOnStart = true,
  });

  final AppServices services;

  /// Tests that preset the session pass `false`.
  final bool restoreOnStart;

  @override
  State<NitumeCustomerApp> createState() => _NitumeCustomerAppState();
}

class _NitumeCustomerAppState extends State<NitumeCustomerApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  late SessionStatus _status;

  SessionController get _session => widget.services.session;
  final _pushSubs = <StreamSubscription<PushMessage>>[];

  @override
  void initState() {
    super.initState();
    _status = _session.status;
    _session.addListener(_onSession);
    if (widget.restoreOnStart) _session.restore();
    if (_status == SessionStatus.signedIn) widget.services.live.start();
    final push = widget.services.push;
    _pushSubs.add(push.openedMessages.listen(_openPush));
    push
        .initialMessage()
        .then((m) {
          if (m != null) _openPush(m);
        })
        .catchError((Object _) {});
  }

  @override
  void dispose() {
    _session.removeListener(_onSession);
    for (final s in _pushSubs) {
      s.cancel();
    }
    super.dispose();
  }

  /// A push tapped before the shell was ready (cold start).
  PushMessage? _pendingPush;

  /// Push tap → the `v-notifications` deep link (row 31).
  void _openPush(PushMessage m) {
    final context = _navigatorKey.currentContext;
    if (_status != SessionStatus.signedIn || context == null) {
      _pendingPush = m;
      return;
    }
    Nav.openNotification(context, eventType: m.eventType, errandId: m.errandId);
  }

  void _onSession() {
    final next = _session.status;
    if (next == _status) return;
    _navigatorKey.currentState?.popUntil((r) => r.isFirst);
    setState(() => _status = next);
    final live = widget.services.live;
    if (next == SessionStatus.signedIn) {
      live.start();
      final pending = _pendingPush;
      if (pending != null) {
        _pendingPush = null;
        WidgetsBinding.instance.addPostFrameCallback((_) => _openPush(pending));
      }
    } else if (next == SessionStatus.signedOut) {
      live.stop();
    }
    if (next != SessionStatus.signedOut) return;
    final String? message;
    if (_session.takeSuspendedFlag()) {
      message = "This account can't sign in. Contact support.";
    } else if (_session.takeExpiredFlag()) {
      message = 'Please sign in again.';
    } else {
      message = null;
    }
    if (message != null) {
      _messengerKey.currentState
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Widget _home() => switch (_status) {
    SessionStatus.restoring => const SplashScreen(),
    SessionStatus.restoreFailed => SplashScreen(onRetry: _session.restore),
    SessionStatus.signedOut => const PhoneScreen(),
    SessionStatus.needsName => const NameCaptureScreen(),
    SessionStatus.signedIn => const HomeShell(),
  };

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp(
        title: 'Nitume',
        debugShowCheckedModeBanner: false,
        theme: NitumeTheme.light(),
        navigatorKey: _navigatorKey,
        scaffoldMessengerKey: _messengerKey,
        home: KeyedSubtree(key: ValueKey(_status), child: _home()),
        onGenerateRoute: onGenerateRoute,
        navigatorObservers: [widget.services.routeObserver],
      ),
    );
  }
}
