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

/// Legal line with `Terms` / `Privacy Policy` links (`x-legal`, row 39).
/// A configured link is a C-04 link button (48dp hit area) opened through
/// `AppConfig.open`; an unconfigured one is plain text.
class _LegalLine extends StatelessWidget {
  const _LegalLine();

  @override
  Widget build(BuildContext context) {
    final config = context.services.appConfig;
    final style = NitumeTextStyles.muted.copyWith(fontSize: 12.5);

    Widget part(String text, Uri? uri) {
      if (uri == null) return Text(text, style: style);
      return NitumeButton.link(
        label: text,
        onPressed: () async {
          final ok = await config.open(uri);
          if (!ok && context.mounted) {
            showSnack(context, "Couldn't open the page. Try again later.");
          }
        },
      );
    }

    return Semantics(
      container: true,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text("By continuing you agree to Nitume's ", style: style),
          part('Terms', config.termsLink),
          Text(' & ', style: style),
          part('Privacy Policy', config.privacyLink),
          Text('.', style: style),
        ],
      ),
    );
  }
}
