/// Local UI state for the OTP sign-in flow.
class AuthFormState {
  const AuthFormState({
    this.phone = '',
    this.code = '',
    this.step = AuthFormStep.phone,
    this.isBusy = false,
    this.error,
    this.resendMessage,
  });

  final String phone;
  final String code;

  /// Whether we are on the phone-entry step or the code-entry step.
  final AuthFormStep step;
  final bool isBusy;
  final String? error;
  final String? resendMessage;

  AuthFormState copyWith({
    String? phone,
    String? code,
    AuthFormStep? step,
    bool? isBusy,
    String? error,
    String? resendMessage,
  }) {
    return AuthFormState(
      phone: phone ?? this.phone,
      code: code ?? this.code,
      step: step ?? this.step,
      isBusy: isBusy ?? this.isBusy,
      error: error,
      resendMessage: resendMessage,
    );
  }
}

enum AuthFormStep { phone, code }