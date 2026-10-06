import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../config/api_base_url.dart';

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
  bool _isLoading = false;
  AuthFormStep _step = AuthFormStep.phone;

  // API client for auth calls
  late final NitumeApiClient _api;
  late final TokenStore _tokenStore;

  @override
  void initState() {
    super.initState();
    _tokenStore = SecureTokenStore();
    _api = NitumeApiClient(
      config: ApiConfig(baseUrl: resolveApiBaseUrl()),
      tokenStore: _tokenStore,
    );
  }

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
      _isLoading = true;
      _error = '';
    });

    _api.post('/auth/otp/request', data: {'phone': phone}).then((_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _step = AuthFormStep.code;
      });
      _codeFocus.requestFocus();
    }).onError((error, stack) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = _friendlyError(error);
      });
    });
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (RegExp(r'^\d{6}$').hasMatch(code) == false) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      // Call API: POST /auth/otp/verify
      final result = await _api.post('/auth/otp/verify', data: {
        'phone': _phoneController.text.trim(),
        'code': code,
      });
      final tokens = result is Map ? result['tokens'] : null;
      if (tokens is Map<String, dynamic>) {
        await _tokenStore.write(AuthTokens.fromJson(tokens));
      }

      if (!mounted) return;
      setState(() => _isLoading = false);

      // Navigate to home on success
      Navigator.pushReplacementNamed(context, '/home');
    } on NitumeApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = 'Something went wrong. Please try again.';
      });
    }
  }

  String _friendlyError(Object? error) {
    if (error is NitumeApiException) return error.message;
    return 'Something went wrong. Please try again.';
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
                  isLoading: _isLoading,
                  onSubmit: _verifyCode,
                  onResend: _requestOtp,
                ),
              ],
              if (_error.isNotEmpty) ...[
                const SizedBox(height: NitumeSpacing.sm),
                _ErrorText(_error),
              ],
              if (!isCodeStep) ...[
                const SizedBox(height: NitumeSpacing.lg),
                FilledButton(
                  onPressed: !_isLoading ? _requestOtp : null,
                  child: _isLoading
                      ? const CircularProgressIndicator(color: NitumeColors.white)
                      : const Text('Continue'),
                ),
              ],
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
    required this.step,
    required this.controller,
    required this.focusNode,
    required this.isLoading,
    required this.onSubmit,
    required this.onResend,
  });

  final AuthFormStep step;
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isLoading;
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
          onPressed: step == AuthFormStep.code && !isLoading ? onSubmit : null,
          child: step == AuthFormStep.code && isLoading
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
          onPressed: onResend,
          child: const Text('Didn\'t get it? Send again'),
        ),
      ],
    );
  }
}