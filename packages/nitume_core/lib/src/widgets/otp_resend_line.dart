import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_button.dart';

/// Resend line under the OTP boxes (`.resend`, v-auth-otp): 12.5 slate-600,
/// centred.
///
/// - Cooldown running: `Resend code in` + Fira Code countdown `0:42`.
/// - Otherwise: `Didn't get it?` + green-700 link `Resend code`.
///
/// Drive [secondsRemaining] from a `ResendCooldown` (60s, Q17).
class OtpResendLine extends StatelessWidget {
  const OtpResendLine({
    super.key,
    required this.secondsRemaining,
    required this.onResend,
    this.sending = false,
  });

  final int secondsRemaining;

  /// Called when the link is tapped. Ignored while counting down or sending.
  final VoidCallback onResend;

  /// True while the resend request is in flight (link disabled).
  final bool sending;

  @override
  Widget build(BuildContext context) {
    final style = NitumeTextStyles.muted.copyWith(fontSize: 12.5);
    if (secondsRemaining > 0) {
      final countdown = formatCountdown(Duration(seconds: secondsRemaining));
      return Semantics(
        label: 'Resend code in $secondsRemaining seconds',
        excludeSemantics: true,
        child: SizedBox(
          height: NitumeSpacing.minTapTarget,
          child: Center(
            child: Text.rich(
              TextSpan(
                text: 'Resend code in ',
                children: [
                  TextSpan(
                    text: countdown,
                    style: NitumeTypography.numeric(
                      fontSize: 12.5,
                      color: NitumeColors.slate600,
                    ),
                  ),
                ],
              ),
              key: const ValueKey('otp-resend-countdown'),
              style: style,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text("Didn't get it?", style: style),
        NitumeButton.link(
          label: 'Resend code',
          onPressed: sending ? null : onResend,
        ),
      ],
    );
  }
}
