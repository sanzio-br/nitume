import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// UI state for the OTP sign-in screen, managed with [ValueNotifier].
class AuthFormNotifier {
  AuthFormNotifier() : _value = const AuthFormState();

  ValueNotifier<AuthFormState> get notifier => _value;

  AuthFormState get state => _value.value;

  set state(AuthFormState value) {
    _value = value;
    _value.notifyListeners();
  }

  final ValueNotifier<AuthFormState> _value;

  /// Step 1: request the OTP and advance to code entry.
  Future<bool> requestOtp(String phone, AuthRepository repo) async {
    if (!KenyanPhone.isValid(phone)) {
      state = state.copyWith(
        error: 'Enter a valid Kenyan number, e.g. 0712 345 678',
      );
      return false;
    }

    state = state.copyWith(isBusy: true);
    try {
      await repo.requestOtp(phone);
      state = state.copyWith(
        step: AuthFormStep.code,
        isBusy: false,
        error: null,
        resendMessage: null,
      );
      return true;
    } on NitumeApiException catch (error) {
      state = state.copyWith(isBusy: false, error: error.message);
      return false;
    }
  }

  /// Step 2: verify the code and sign the user in.
  Future<bool> verifyCode(String code, AuthController controller,
      AuthRepository repo) async {
    if (RegExp(r'^\d{6}$').hasMatch(code) == false) {
      state = state.copyWith(error: 'Enter the 6-digit code');
      return false;
    }

    state = state.copyWith(isBusy: true);
    try {
      await controller.verifyOtp(phone: state.phone.trim(), code: code);
      state = state.copyWith(isBusy: false, error: null);
      return true;
    } on NitumeApiException catch (error) {
      state = state.copyWith(isBusy: false, error: error.message);
      return false;
    }
  }

  void resend(AuthRepository repo) {
    state = state.copyWith(step: AuthFormStep.phone, error: null);
    repo.requestOtp(state.phone).then((_) {
      if (mounted) state = state.copyWith(resendMessage: 'Code sent.');
    });
  }
}

enum AuthFormStep { phone, code }