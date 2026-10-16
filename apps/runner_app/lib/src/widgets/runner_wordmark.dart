import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// R-17 stand-in: core [NitumeWordmark] followed by `Runner` 12/600
/// slate-600 (`.auth-logo`).
// TODO(core-ui): replace with `NitumeWordmark(suffix: 'Runner')` (R-17).
class RunnerWordmark extends StatelessWidget {
  const RunnerWordmark({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Nitume Runner',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const NitumeWordmark(),
          const SizedBox(width: 8),
          Text(
            'Runner',
            style: NitumeTextStyles.chip.copyWith(color: NitumeColors.slate600),
          ),
        ],
      ),
    );
  }
}
