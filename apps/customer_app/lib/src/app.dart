import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import 'screens/auth/otp_login_screen.dart';
import 'screens/home_shell.dart';
import 'state/auth_controller.dart';
import 'state/providers.dart';

class NitumeCustomerApp extends StatelessWidget {
  const NitumeCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nitume',
      debugShowCheckedModeBanner: false,
      theme: NitumeTheme.light(),
      home: const _RootGate(),
    );
  }
}

/// Chooses between the OTP flow and the authenticated shell, and returns the
/// user to sign-in when the session expires mid-flight.
class _RootGate extends ConsumerWidget {
  const _RootGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider);

    ref.listen(sessionExpiredProvider, (previous, expired) {
      if (expired == true) {
        ref.read(sessionExpiredProvider.notifier).state = false;
        ref.read(authControllerProvider.notifier).logout();
      }
    });

    return session.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => const OtpLoginScreen(),
      data: (user) => user == null ? const OtpLoginScreen() : const HomeShell(),
    );
  }
}