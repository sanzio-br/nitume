import 'package:flutter/widgets.dart';

/// Fixed bottom CTA (`.cta-fixed`, customer and runner `_shared.md` §5):
/// full width minus 40, margin `auto 20 6` (8 above), above the bottom safe
/// area and the keyboard. Pass it as `Scaffold.bottomNavigationBar`.
///
/// Promoted from the identical `FixedCta` copies in `customer_app` and
/// `runner_app` (C5); named with the `Nitume` prefix so it does not clash
/// with those copies until the apps switch to it.
class NitumeFixedCta extends StatelessWidget {
  const NitumeFixedCta({super.key, required this.child, this.above});

  /// The button (usually a full-width `NitumeButton.primary`).
  final Widget child;

  /// Optional widget above the button, 10 apart (a caption or notice, e.g.
  /// an expired-quote notice).
  final Widget? above;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (above != null) ...[above!, const SizedBox(height: 10)],
              child,
            ],
          ),
        ),
      ),
    );
  }
}
