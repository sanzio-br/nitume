import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../util/display.dart';
import '../../widgets/common.dart';
import 'auth_frame.dart';

/// `v-auth-phone`: phone entry, sign in or sign up.
class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _controller = TextEditingController();
  String? _fieldError;
  Widget? _error;
  bool _loading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_loading) return;
    FocusScope.of(context).unfocus();
    final String phone;
    try {
      phone = KenyanPhone.normalize(_controller.text);
    } on FormatException {
      setState(() {
        _fieldError = 'Enter a valid Kenyan number, e.g. +254 712 345 678';
        _error = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _fieldError = null;
      _error = null;
    });
    final services = context.services;
    try {
      await services.auth.requestOtp(phone);
      if (!mounted) return;
      setState(() => _loading = false);
      await Nav.toOtp(context, phone: phone);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      switch (OtpErrorKind.fromApiException(e)) {
        case OtpErrorKind.resendTooSoon:
          // A code was sent less than 60 s ago: no error, continue (OA-17).
          await Nav.toOtp(
            context,
            phone: phone,
            cooldown: e.retryAfter ?? OtpPolicy.resendCooldown,
          );
        case OtpErrorKind.requestLimitReached:
          setState(() => _error = rateLimitError(e.retryAfter));
        case OtpErrorKind.deliveryFailed:
          setState(
            () => _error = const InlineError(
              "We couldn't send the code. Try again.",
            ),
          );
        default:
          setState(() => _error = InlineError(friendlyError(e)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthFrame(
      children: [
        const Align(alignment: Alignment.centerLeft, child: NitumeWordmark()),
        const SizedBox(height: 30),
        const AuthHeading(
          title: "Someone there, when you can't be.",
          sub: Text('Enter your phone number to sign in or create an account.'),
        ),
        Semantics(
          label: 'Phone number',
          child: NitumeField.phone(
            controller: _controller,
            hint: '+254 7XX XXX XXX',
            enabled: !_loading,
            errorText: _fieldError,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => _send(),
            onChanged: (_) {
              if (_fieldError != null) setState(() => _fieldError = null);
            },
          ),
        ),
        if (_error != null) ...[const SizedBox(height: 8), _error!],
        const SizedBox(height: 16),
        NitumeButton.primary(
          label: 'Send code',
          expand: true,
          loading: _loading,
          onPressed: _send,
        ),
        const SizedBox(height: 14),
        const _LegalLine(),
      ],
    );
  }
}

/// `Too many code requests. Try again in N min.` (N in Fira Code), or
/// `… Try again later.` without a wait time.
Widget rateLimitError(Duration? wait) {
  if (wait == null) {
    return const InlineError('Too many code requests. Try again later.');
  }
  return InlineError(
    'Too many code requests. Try again in ',
    number: minutesFrom(wait),
    suffix: ' min.',
  );
}

/// Legal line with `Terms` / `Privacy Policy` links (`x-legal`). A link is
/// styled and tappable only when its URL and the launcher are configured
/// (SQ-2); otherwise the line is plain text.
class _LegalLine extends StatefulWidget {
  const _LegalLine();

  @override
  State<_LegalLine> createState() => _LegalLineState();
}

class _LegalLineState extends State<_LegalLine> {
  final _recognizers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  TextSpan _link(String text, Uri? uri, AppConfig config) {
    if (uri == null) return TextSpan(text: text);
    final r = TapGestureRecognizer()
      ..onTap = () async {
        final ok = await config.open(uri);
        if (!ok && mounted) {
          showSnack(context, "Couldn't open the page. Try again later.");
        }
      };
    _recognizers.add(r);
    return TextSpan(
      text: text,
      recognizer: r,
      style: const TextStyle(color: NitumeColors.green700),
    );
  }

  @override
  Widget build(BuildContext context) {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    final config = context.services.appConfig;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text.rich(
        TextSpan(
          text: "By continuing you agree to Nitume's ",
          children: [
            _link('Terms', config.termsLink, config),
            const TextSpan(text: ' & '),
            _link('Privacy Policy', config.privacyLink, config),
            const TextSpan(text: '.'),
          ],
        ),
        style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
      ),
    );
  }
}
