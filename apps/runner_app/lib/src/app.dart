import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import 'navigation/nav.dart';
import 'navigation/routes.dart';
import 'screens/auth/name_capture_screen.dart';
import 'screens/auth/phone_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/shell/runner_shell.dart';
import 'services/app_services.dart';
import 'services/onboarding_routing.dart';
import 'services/session.dart';
import 'util/display.dart';

/// Root widget. The home screen follows the session (`_shared.md` §1):
/// restoring → splash, signed out → `v-auth-phone`, no name →
/// `x-name-capture`, signed in → the shell on Jobs. Every session change
/// clears the pushed stack. After an OTP sign-in the onboarding routing
/// (D-1) pushes `v-onboard-id`, `v-onboard-selfie` or `v-onboard-pending`
/// over the shell when verification is not complete.
class NitumeRunnerApp extends StatefulWidget {
  const NitumeRunnerApp({
    super.key,
    required this.services,
    this.restoreOnStart = true,
  });

  final AppServices services;

  /// Tests that preset the session pass `false`.
  final bool restoreOnStart;

  @override
  State<NitumeRunnerApp> createState() => _NitumeRunnerAppState();
}

class _NitumeRunnerAppState extends State<NitumeRunnerApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  late SessionStatus _status;

  SessionController get _session => widget.services.session;

  @override
  void initState() {
    super.initState();
    _status = _session.status;
    _session.addListener(_onSession);
    if (widget.restoreOnStart) _session.restore();
  }

  @override
  void dispose() {
    _session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    final next = _session.status;
    if (next == _status) return;
    _navigatorKey.currentState?.popUntil((r) => r.isFirst);
    if (next == SessionStatus.signedIn) {
      widget.services.shell.reset();
      unawaited(widget.services.startSession());
    } else if (_status == SessionStatus.signedIn) {
      unawaited(widget.services.endSession());
    }
    setState(() => _status = next);
    if (next == SessionStatus.signedIn && _session.takeFreshSignIn()) {
      _routeOnboarding();
    }
    if (next != SessionStatus.signedOut) return;
    final String? message;
    if (_session.takeSuspendedFlag()) {
      message = suspendedMessage;
    } else if (_session.takeWrongAccountFlag()) {
      message = wrongAccountMessage;
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

  Future<void> _routeOnboarding() async {
    final step = await onboardingStepFor(widget.services.account);
    final nav = _navigatorKey.currentState;
    if (!mounted || nav == null || _status != SessionStatus.signedIn) return;
    switch (step) {
      case OnboardingStep.shell:
        break;
      case OnboardingStep.id:
        nav.pushNamed(
          Routes.onboardId,
          arguments: const OnboardIdArgs(firstRun: true),
        );
      case OnboardingStep.selfie:
        nav.pushNamed(Routes.onboardSelfie);
      case OnboardingStep.pending:
        nav.pushNamed(Routes.onboardPending);
    }
  }

  Widget _home() => switch (_status) {
    SessionStatus.restoring => const SplashScreen(),
    SessionStatus.restoreFailed => SplashScreen(onRetry: _session.restore),
    SessionStatus.signedOut => const PhoneScreen(),
    SessionStatus.needsName => const NameCaptureScreen(),
    SessionStatus.signedIn => const RunnerShell(),
  };

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp(
        title: 'Nitume Runner',
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
