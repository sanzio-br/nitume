import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nitume_core/nitume_core.dart';

enum AuthFormStep { phone, code }

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

class OtpLoginScreen extends StatefulWidget {
  const OtpLoginScreen({super.key});

  @override
  State<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

class _OtpLoginScreenState extends State<OtpLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();

  String _error = '';
  AuthFormStep _step = AuthFormStep.phone;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _requestOtp() {
    FocusScope.of(context).unfocus();
    final phone = _phoneController.text.trim();
    if (!KenyanPhone.isValid(phone)) {
      setState(() => _error = 'Enter a valid Kenyan number, e.g. 0712 345 678');
      return;
    }

    setState(() {
      _step = AuthFormStep.code;
      _error = '';
    });
    _codeFocus.requestFocus();
  }

  void _verifyCode() {
    final code = _codeController.text.trim();
    if (RegExp(r'^\d{6}$').hasMatch(code) == false) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    Navigator.pushReplacementNamed(context, '/home');
  }

  @override
  Widget build(BuildContext context) {
    final isCodeStep = _step == AuthFormStep.code;

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
                    ? 'We sent a 6-digit code to ${_prettyPhone(_phoneController.text)}.'
                    : 'Enter your phone number to sign in or create an account.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: NitumeColors.slate600,
                    ),
              ),
              const SizedBox(height: NitumeSpacing.lg),
              if (!isCodeStep) ...[
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  autofocus: true,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                    LengthLimitingTextInputFormatter(13),
                  ],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _requestOtp(),
                  decoration: const InputDecoration(
                    labelText: 'Phone number',
                    hintText: '0712 345 678',
                    prefixIcon: Icon(Icons.phone),
                  ),
                ),
              ] else ...[
                const SizedBox(height: NitumeSpacing.lg),
                _CodeStep(
                  step: _step,
                  controller: _codeController,
                  focusNode: _codeFocus,
                  onSubmit: _verifyCode,
                  onResend: _requestOtp,
                ),
              ],
              if (_error.isNotEmpty && !isCodeStep) ...[
                const SizedBox(height: NitumeSpacing.sm),
                _ErrorText(_error),
              ],
              const SizedBox(height: NitumeSpacing.lg),
              FilledButton(
                onPressed: _step == AuthFormStep.phone ? _requestOtp : null,
                child: _step == AuthFormStep.phone
                    ? const Text('Continue')
                    : const CircularProgressIndicator(
                        color: NitumeColors.white,
                      ),
              ),
              const SizedBox(height: NitumeSpacing.md),
              const Text(
                'We\'ll text you a code. Standard message rates may apply.',
                textAlign: TextAlign.center,
                style: TextStyle(color: NitumeColors.slate400),
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

class _CodeStep extends StatelessWidget {
  const _CodeStep({
    required AuthFormStep step,
    required TextEditingController controller,
    required FocusNode focusNode,
    required VoidCallback onSubmit,
    required VoidCallback onResend,
  })  : step = step,
       controller = controller,
       focusNode = focusNode,
       onSubmit = onSubmit,
       onResend = onResend;

  final AuthFormStep step;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSubmit;
  final VoidCallback onResend;

  @override
  Widget build(BuildContext context) {
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
          onSubmitted: (_) => onSubmit,
          decoration: const InputDecoration(hintText: '••••••'),
        ),
        const SizedBox(height: NitumeSpacing.md),
        FilledButton(
          onPressed: step == AuthFormStep.code ? onSubmit : null,
          child: step == AuthFormStep.code
              ? const Text('Verify')
              : const CircularProgressIndicator(
                  color: NitumeColors.white,
                ),
        ),
        const SizedBox(height: NitumeSpacing.md),
        TextButton(
          onPressed: onResend,
          child: const Text('Didn\'t get it? Send again'),
        ),
      ],
    );
  }
}