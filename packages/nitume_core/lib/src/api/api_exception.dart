import 'package:dio/dio.dart';

/// A normalised API failure, safe to show to a user.
///
/// The NestJS API returns `{ statusCode, message, error }` where `message` may
/// be a string or a list of validation messages.
class NitumeApiException implements Exception {
  const NitumeApiException({
    required this.message,
    this.statusCode,
    this.fieldErrors = const {},
    this.isNetworkError = false,
    this.isUnauthorized = false,
  });

  final String message;
  final int? statusCode;
  final Map<String, List<String>> fieldErrors;
  final bool isNetworkError;
  final bool isUnauthorized;

  factory NitumeApiException.fromDio(DioException error) {
    final status = error.response?.statusCode;
    final isUnauthorized = status == 401;

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

    if (data is Map) {
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

    if (isUnauthorized) {
      message = 'Your session has expired. Please sign in again.';
    }

    return NitumeApiException(
      message: message,
      statusCode: status,
      fieldErrors: fieldErrors,
      isUnauthorized: isUnauthorized,
    );
  }

  @override
  String toString() => 'NitumeApiException($statusCode): $message';
}
