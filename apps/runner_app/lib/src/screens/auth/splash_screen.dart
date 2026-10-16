import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../widgets/runner_wordmark.dart';

/// Launch screen while the session is restored. With [onRetry] it shows the
/// generic network error (`_shared.md` §7).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const RunnerWordmark(),
              if (onRetry != null)
                NitumeErrorState(
                  message: 'Check your connection and try again.',
                  onRetry: onRetry!,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
