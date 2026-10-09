import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_exception.dart';

/// OTP rules decided by the owner (Q17). The server enforces all of them;
/// the app only uses them for display (countdown, copy).
abstract final class OtpPolicy {
  /// Digits per code.
  static const codeLength = 6;

  /// A code expires 5 minutes after it is issued.
  static const expiry = Duration(minutes: 5);

  /// Verification attempts allowed per code.
  static const maxAttempts = 5;

  /// Wait before another code may be requested.
  static const resendCooldown = Duration(seconds: 60);

  /// Code requests allowed per phone/account per hour (server-side only).
  static const maxRequestsPerHour = 5;
}

/// Presentational OTP error states. The screen picks the copy and whether
/// the code boxes stay enabled; [requiresNewCode] tells it when the current
/// code can no longer succeed.
///
/// Mapped from the API's `code` (`OtpErrorCode` in
/// `apps/api/src/auth/otp.service.ts`); see [fromApiException].
enum OtpErrorKind {
  /// `otp_incorrect`: wrong code; more attempts remain
  /// (`NitumeApiException.intDetail('attemptsRemaining')`).
  incorrect('otp_incorrect'),

  /// `otp_expired`: the code expired (5 minutes) or a newer one replaced it.
  expired('otp_expired'),

  /// `otp_attempts_exhausted`: all 5 attempts used on this code.
  attemptsExhausted('otp_attempts_exhausted'),

  /// `otp_not_requested`: no unused code exists for this phone.
  notRequested('otp_not_requested'),

  /// `otp_resend_cooldown`: resend inside the 60s cooldown. Restart the
  /// countdown from `NitumeApiException.retryAfter`.
  resendTooSoon('otp_resend_cooldown'),

  /// `otp_rate_limited`: hourly request limit reached; wait
  /// `NitumeApiException.retryAfter`.
  requestLimitReached('otp_rate_limited'),

  /// `otp_delivery_failed`: the SMS could not be sent; safe to retry now.
  deliveryFailed('otp_delivery_failed');

  const OtpErrorKind(this.code);

  /// API error code.
  final String code;

  /// True when the customer must request a new code before verifying again.
  bool get requiresNewCode =>
      this == expired || this == attemptsExhausted || this == notRequested;

  /// Classifies an API error from `/auth/otp/request` or `/auth/otp/verify`.
  /// Returns `null` for anything else (network, server errors).
  ///
  /// Uses the API `code`. Responses without a code (older API builds) fall
  /// back to matching the message text and status.
  static OtpErrorKind? fromApiException(NitumeApiException error) {
    final code = error.code;
    if (code != null) {
      for (final kind in values) {
        if (kind.code == code) return kind;
      }
      return null;
    }
    final m = error.message.toLowerCase();
    if (error.statusCode == 429) {
      if (m.contains('please wait')) return resendTooSoon;
      return requestLimitReached;
    }
    if (error.statusCode == 401) {
      if (m.contains('too many incorrect')) return attemptsExhausted;
      if (m.contains('expired') || m.contains('no active verification code')) {
        return expired;
      }
      if (m.contains('no verification code')) return notRequested;
      if (m.contains('incorrect verification code')) return incorrect;
    }
    return null;
  }
}

/// Counts down the resend cooldown in whole seconds. Call [start] after each
/// successful code request; listen to rebuild an `OtpResendLine`.
class ResendCooldown extends ChangeNotifier {
  ResendCooldown({this.duration = OtpPolicy.resendCooldown});

  final Duration duration;
  Timer? _timer;
  int _remaining = 0;

  /// Seconds left; 0 when a resend is allowed.
  int get secondsRemaining => _remaining;

  bool get isActive => _remaining > 0;

  /// Restarts the countdown from [duration] (or [from], e.g. when the API
  /// reports a longer wait).
  void start([Duration? from]) {
    _timer?.cancel();
    _remaining = (from ?? duration).inSeconds;
    notifyListeners();
    if (_remaining <= 0) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      _remaining = _remaining > 0 ? _remaining - 1 : 0;
      if (_remaining == 0) t.cancel();
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
