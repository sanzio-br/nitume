import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../state/auth_controller.dart';
import '../../state/auth_form_state.dart';

/// Sign-in / sign-up via phone OTP, matching the first two frames of
/// `designs/nitume_customer_app.html`.
class OtpLoginScreen extends ConsumerStatefulWidget {
  const OtpLoginScreen({super.key});

  @override
  ConsumerState<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

class _OtpLoginScreenState extends ConsumerState<OtpLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    FocusScope.of(context).unfocus();
    final notifier = ref.read(authFormProvider.notifier);
    final ok = await notifier.requestOtp();
    if (ok && mounted) _codeFocus.requestFocus();
  }

  Future<void> _verifyCode() async {
    FocusScope.of(context).unfocus();
    final controller = ref.read(authControllerProvider.notifier);
    await ref.read(authFormProvider.notifier).verifyCode(controller);
  }

  @override
  Widget build(BuildContext context) {
    final form = ref.watch(authFormProvider);
    final isCodeStep = form.step == AuthFormStep.code;

    // The global session error (e.g. invalid code) surfaces here.
    ref.listen(authControllerProvider, (previous, next) {
      if (next.hasError && isCodeStep) {
        final error = next.error;
        if (error is NitumeApiException) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.message)),
          );
        }
      }
    });

    return Scaffold(
      backgroundColor: NitumeColors.slate,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(NitumeSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _Brand(),
              const SizedBox(height: NitumeSpacing.xl),
              Text(
                isCodeStep ? 'Enter the code' : 'Someone there, when you can\'t be.',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: NitumeSpacing.sm),
              Text(
                isCodeStep
                    ? 'We sent a 6-digit code to ${_prettyPhone(form.phone)}.'
                    : 'Enter your phone number to sign in or create an account.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: NitumeColors.slate600,
                    ),
              ),
              const SizedBox(height: NitumeSpacing.lg),
              if (isCodeStep)
                _CodeStep(
                  form: form,
                  controller: _codeController,
                  focusNode: _codeFocus,
                  onSubmit: _verifyCode,
                  onResend: () {
                    ref.read(authFormProvider.notifier).resend();
                    _codeController.clear();
                  },
                )
              else
                _PhoneStep(
                  form: form,
                  controller: _phoneController,
                  onSubmit: _requestOtp,
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _prettyPhone(String raw) {
    try {
      return KenyanPhone.format(raw);
    } on FormatException {
      return raw;
    }
  }
}

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: NitumeColors.blue,
            borderRadius: BorderRadius.circular(NitumeRadii.medium),
          ),
          child: const Icon(Icons.handyman, color: NitumeColors.white),
        ),
        const SizedBox(width: NitumeSpacing.md),
        Text(
          'Nitume',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    );
  }
}

class _PhoneStep extends ConsumerWidget {
  const _PhoneStep({
    required this.form,
    required this.controller,
    required this.onSubmit,
  });

  final AuthFormState form;
  final TextEditingController controller;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          keyboardType: TextInputType.phone,
          autofocus: true,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
            LengthLimitingTextInputFormatter(13),
          ],
          textInputAction: TextInputAction.done,
          onChanged: (value) =>
              ref.read(authFormProvider.notifier).setPhone(value),
          onSubmitted: (_) => onSubmit(),
          decoration: const InputDecoration(
            labelText: 'Phone number',
            hintText: '0712 345 678',
            prefixIcon: Icon(Icons.phone_outlined),
          ),
        ),
        if (form.error != null) ...[
          const SizedBox(height: NitumeSpacing.sm),
          _ErrorText(form.error!),
        ],
        const SizedBox(height: NitumeSpacing.lg),
        FilledButton(
          onPressed: form.isBusy ? null : onSubmit,
          child: form.isBusy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: NitumeColors.white,
                  ),
                )
              : const Text('Continue'),
        ),
        const SizedBox(height: NitumeSpacing.md),
        Text(
          'We\'ll text you a code. Standard message rates may apply.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: NitumeColors.slate400,
              ),
        ),
      ],
    );
  }
}

class _CodeStep extends ConsumerWidget {
  const _CodeStep({
    required this.form,
    required this.controller,
    required this.focusNode,
    required this.onSubmit,
    required this.onResend,
  });

  final AuthFormState form;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSubmit;
  final VoidCallback onResend;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          textInputAction: TextInputAction.done,
          style: NitumeTypography.numeric(fontSize: 24, letterSpacing: 8),
          textAlign: TextAlign.center,
          onChanged: (value) =>
              ref.read(authFormProvider.notifier).setCode(value),
          onSubmitted: (_) => onSubmit(),
          decoration: const InputDecoration(hintText: '••••••'),
        ),
        if (form.error != null) ...[
          const SizedBox(height: NitumeSpacing.sm),
          _ErrorText(form.error!),
        ],
        const SizedBox(height: NitumeSpacing.lg),
        FilledButton(
          onPressed: form.isBusy ? null : onSubmit,
          child: form.isBusy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: NitumeColors.white,
                  ),
                )
              : const Text('Verify'),
        ),
        const SizedBox(height: NitumeSpacing.md),
        TextButton(
          onPressed: form.isBusy ? null : onResend,
          child: const Text('Didn\'t get it? Send again'),
        ),
      ],
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.error_outline, color: NitumeColors.red, size: 18),
        const SizedBox(width: NitumeSpacing.sm),
        Expanded(
          child: Text(
            message,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: NitumeColors.red,
                ),
          ),
        ),
      ],
    );
  }
}