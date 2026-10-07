import 'package:dio/dio.dart';

/// A normalised API failure, safe to show to a user.
///
/// The NestJS API returns `{ statusCode, message, error }` where `message` may
/// be a string or a list of validation messages. Errors raised as `ApiError`
/// (`apps/api/src/common/api-error.ts`) also carry a stable machine-readable
/// [code] (e.g. `otp_incorrect`, `idempotency_key_reused`) plus extra fields
/// in [details] (e.g. `attemptsRemaining`, `retryAfterSeconds`). Switch on
/// [code], never on [message] text.
class NitumeApiException implements Exception {
  const NitumeApiException({
    required this.message,
    this.statusCode,
    this.code,
    this.details = const {},
    this.fieldErrors = const {},
    this.isNetworkError = false,
    this.isUnauthorized = false,
  });

  final String message;
  final int? statusCode;

  /// Machine-readable error code from the API, when it sent one.
  final String? code;

  /// Extra body fields beside `statusCode`, `code`, `message`, `error`.
  final Map<String, Object?> details;

  /// Integer detail such as `attemptsRemaining` or `secondsRemaining`.
  int? intDetail(String key) {
    final v = details[key];
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  /// `retryAfterSeconds` as a [Duration], when present.
  Duration? get retryAfter {
    final s = intDetail('retryAfterSeconds');
    return s == null ? null : Duration(seconds: s);
  }

  final Map<String, List<String>> fieldErrors;
  final bool isNetworkError;

  /// Session-level 401 (no [code]): the app signs the user out. Coded 401s
  /// such as `otp_incorrect` are not session failures.
  final bool isUnauthorized;

  factory NitumeApiException.fromDio(DioException error) {
    final status = error.response?.statusCode;

    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.connectionError) {
      return const NitumeApiException(
        message: 'Could not reach Nitume. Check your connection and try again.',
        isNetworkError: true,
      );
    }

    final data = error.response?.data;
    String message = 'Something went wrong. Please try again.';
    final fieldErrors = <String, List<String>>{};
    String? code;
    final details = <String, Object?>{};

    if (data is Map) {
      final rawCode = data['code'];
      if (rawCode is String && rawCode.isNotEmpty) code = rawCode;
      data.forEach((key, value) {
        if (!const {'statusCode', 'code', 'message', 'error', 'errors'}
            .contains(key)) {
          details[key.toString()] = value;
        }
      });
      final raw = data['message'];
      if (raw is String && raw.isNotEmpty) {
        message = raw;
      } else if (raw is List) {
        for (final entry in raw) {
          if (entry is String) {
            message = entry;
            break;
          }
        }
      }
      final errors = data['errors'];
      if (errors is Map) {
        errors.forEach((key, value) {
          if (value is List) {
            fieldErrors[key.toString()] =
                value.map((e) => e.toString()).toList();
          } else if (value != null) {
            fieldErrors[key.toString()] = [value.toString()];
          }
        });
      }
    }

    // A coded 401 (e.g. a wrong OTP) is not a session expiry: keep its text
    // and do not flag the session.
    final isUnauthorized = status == 401 && code == null;
    if (isUnauthorized) {
      message = 'Your session has expired. Please sign in again.';
    }

    return NitumeApiException(
      message: message,
      statusCode: status,
      code: code,
      details: details,
      fieldErrors: fieldErrors,
      isUnauthorized: isUnauthorized,
    );
  }

  @override
  String toString() =>
      'NitumeApiException($statusCode${code == null ? '' : ', $code'}): '
      '$message';
}

/// Machine-readable `code` values the apps switch on
/// (`NitumeApiException.code`). OTP codes live on `OtpErrorKind`.
abstract final class ApiErrorCodes {
  /// `Idempotency-Key` header malformed (8–128 chars, `[A-Za-z0-9_-]`).
  static const idempotencyKeyInvalid = 'idempotency_key_invalid';

  /// The key was already used for a different payment: make a new key.
  static const idempotencyKeyReused = 'idempotency_key_reused';

  /// The errand has a merchant amount and no `merchantRoute` was sent.
  static const merchantRouteRequired = 'merchant_route_required';

  /// `merchant_direct` chosen but the merchant's Till/Paybill is unknown.
  static const merchantDetailsMissing = 'merchant_details_missing';

  /// `paymentMethodId` is not one of the customer's M-Pesa methods.
  static const paymentMethodInvalid = 'payment_method_invalid';

  /// Price-change reject: the task can no longer be cancelled (409).
  static const priceChangeRejectNotCancellable =
      'price_change_reject_not_cancellable';
}
