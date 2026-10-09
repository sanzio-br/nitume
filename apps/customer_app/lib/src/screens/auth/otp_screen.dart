import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import 'auth_frame.dart';
import 'phone_screen.dart' show rateLimitError;

/// `v-auth-otp`: verify the 6-digit code (OA-17 policy).
class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, this.initialCooldown});

  /// Normalized `+2547XXXXXXXX`.
  final String phone;

  /// Remaining resend cooldown; defaults to the full 60 s after a send.
  final Duration? initialCooldown;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();
  final _cooldown = ResendCooldown();
  String? _codeError;
  Widget? _otherError;
  bool _verifying = false;
  bool _sending = false;
  bool _needsNewCode = false;
  bool _rateLimited = false;
  bool _suspended = false;

  @override
  void initState() {
    super.initState();
    _cooldown.start(widget.initialCooldown);
  }

  @override
  void dispose() {
    _code.dispose();
    _cooldown.dispose();
    super.dispose();
  }

  Future<void> _verify([String? value]) async {
    final code = (value ?? _code.text).trim();
    if (_verifying || _needsNewCode) return;
    if (code.length != OtpPolicy.codeLength) {
      setState(() => _codeError = 'Enter the 6-digit code.');
      return;
    }
    setState(() {
      _verifying = true;
      _codeError = null;
      _otherError = null;
      _suspended = false;
    });
    final services = context.services;
    try {
      final result = await services.auth.verifyOtp(
        phone: widget.phone,
        code: code,
        role: UserRole.customer,
      );
      await services.session.completeSignIn(result);
      // The app replaces the stack (name capture or the shell).
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _verifying = false;
        _handleVerifyError(e);
      });
    }
  }

  void _handleVerifyError(NitumeApiException e) {
    switch (OtpErrorKind.fromApiException(e)) {
      case OtpErrorKind.incorrect:
        _codeError = 'That code is incorrect. Try again.';
        _code.clear();
      case OtpErrorKind.attemptsExhausted:
        _codeError = 'Too many incorrect attempts. Request a new code.';
        _needsNewCode = true;
      case OtpErrorKind.expired:
      case OtpErrorKind.notRequested:
        _codeError = 'This code has expired. Request a new code.';
        _needsNewCode = true;
      default:
        if (e.isAccountSuspended || (e.statusCode == 401 && e.code == null)) {
          // account_suspended (older API builds: an uncoded 401).
          _suspended = true;
          _otherError = const InlineError(
            "This account can't sign in. Contact support.",
          );
        } else {
          _otherError = InlineError(friendlyError(e));
        }
    }
  }

  Future<void> _resend() async {
    if (_sending || _cooldown.isActive) return;
    setState(() {
      _sending = true;
      _otherError = null;
    });
    final services = context.services;
    try {
      await services.auth.requestOtp(widget.phone);
      if (!mounted) return;
      _cooldown.start();
      _code.clear();
      setState(() {
        _sending = false;
        _needsNewCode = false;
        _codeError = null;
      });
      showSnack(context, 'New code sent.');
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        switch (OtpErrorKind.fromApiException(e)) {
          case OtpErrorKind.resendTooSoon:
            _cooldown.start(e.retryAfter ?? OtpPolicy.resendCooldown);
          case OtpErrorKind.requestLimitReached:
            _rateLimited = true;
            _otherError = rateLimitError(e.retryAfter);
          case OtpErrorKind.deliveryFailed:
            _otherError = const InlineError(
              "We couldn't send the code. Try again.",
            );
          default:
            _otherError = InlineError(friendlyError(e));
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final support = context.services.appConfig.supportLink;
    return AuthFrame(
      header: const NitumePushedHeader(),
      children: [
        AuthHeading(
          title: 'Enter the code',
          sub: Text.rich(
            TextSpan(
              text: 'We sent a 6-digit code to ',
              children: [
                TextSpan(
                  text: formatPhoneIntl(widget.phone),
                  style: NitumeTypography.numeric(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: NitumeColors.slate600,
                  ),
                ),
                const TextSpan(text: '.'),
              ],
            ),
          ),
        ),
        OtpCodeField(
          controller: _code,
          enabled: !_verifying && !_needsNewCode,
          errorText: _codeError,
          semanticLabel: 'Verification code, 6 digits',
          onCompleted: _verify,
          onChanged: (_) {
            if (_codeError != null && !_needsNewCode) {
              setState(() => _codeError = null);
            }
          },
        ),
        if (_otherError != null) ...[
          const SizedBox(height: 10),
          Center(child: _otherError!),
          if (_suspended && support != null)
            Center(
              child: NitumeButton.link(
                label: 'Contact support',
                onPressed: () => context.services.appConfig.open(support),
              ),
            ),
        ],
        const SizedBox(height: 22),
        NitumeButton.primary(
          label: 'Verify & continue',
          expand: true,
          loading: _verifying,
          onPressed: _needsNewCode ? null : () => _verify(),
        ),
        const SizedBox(height: 16),
        if (!_rateLimited)
          ListenableBuilder(
            listenable: _cooldown,
            builder: (context, _) => OtpResendLine(
              secondsRemaining: _cooldown.secondsRemaining,
              sending: _sending,
              onResend: _resend,
            ),
          ),
      ],
    );
  }
}
