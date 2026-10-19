import 'package:flutter/material.dart';

/// Shows a snackbar through the nearest messenger.
void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Fixed bottom CTA (`.cta-fixed`, `_shared.md` §5): full width minus 40,
/// margin `auto 20 6`, above the bottom safe area and the keyboard. Pass it
/// as `Scaffold.bottomNavigationBar`.
// TODO(core-ui): same layout as the customer app's `FixedCta`; switch to a
// nitume_core version once one is promoted.
class FixedCta extends StatelessWidget {
  const FixedCta({super.key, required this.child, this.above});

  final Widget child;

  /// Optional widget above the button (a caption or notice).
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
