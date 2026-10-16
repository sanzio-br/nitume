import 'package:dio/dio.dart';

import '../models/enums.dart';

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

  /// True for [ApiErrorCodes.accountSuspended].
  bool get isAccountSuspended => code == ApiErrorCodes.accountSuspended;

  /// `expiresAt` of a `quote_expired` error, when sent.
  DateTime? get quoteExpiresAt {
    final v = details['expiresAt'];
    return v is String ? DateTime.tryParse(v) : null;
  }

  /// Decimal-string detail such as `minimumAmount` or `availableAmount`
  /// (`"500.00"`), when present.
  String? decimalDetail(String key) {
    final v = details[key];
    if (v is num) return v.toStringAsFixed(2);
    if (v is String && v.trim().isNotEmpty) return v;
    return null;
  }

  /// `minimumAmount` of a [ApiErrorCodes.payoutBelowMinimum] error.
  String? get minimumAmount => decimalDetail('minimumAmount');

  /// `availableAmount` of a [ApiErrorCodes.payoutExceedsAvailable] error.
  String? get availableAmount => decimalDetail('availableAmount');

  /// HTTP 413: the upload is above the server's size limit (e.g. an ID image
  /// over 10 MB, row 163). Sent without a [code].
  bool get isPayloadTooLarge => statusCode == 413;

  /// `offerExpiresAt` of an [ApiErrorCodes.offerExpired] error, when sent.
  DateTime? get offerExpiresAt {
    final v = details['offerExpiresAt'];
    return v is String ? DateTime.tryParse(v) : null;
  }

  /// `from` of an [ApiErrorCodes.illegalTransition] error: the task's
  /// committed state; `null` when absent or unknown.
  ErrandStatus? get transitionFrom => ErrandStatus.tryFromWire(details['from']);

  /// `to` of an [ApiErrorCodes.illegalTransition] error.
  ErrandStatus? get transitionTo => ErrandStatus.tryFromWire(details['to']);

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
        if (!const {
          'statusCode',
          'code',
          'message',
          'error',
          'errors',
        }.contains(key)) {
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
            fieldErrors[key.toString()] = value
                .map((e) => e.toString())
                .toList();
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
  /// `POST /auth/otp/verify` with `role: runner` for a phone that belongs to
  /// another role (RA-9, row 127). Not sent by the API yet; the runner app's
  /// client-side role check covers it until then.
  static const roleMismatch = 'role_mismatch';

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

  /// The request was already approved, rejected or withdrawn (409). Show
  /// the "already answered" state (`v-price-auth`).
  static const priceChangeAlreadyDecided = 'price_change_already_decided';

  /// The errand is no longer IN_PROGRESS, so the price change cannot be
  /// decided (409, row 49). Treated like [priceChangeAlreadyDecided].
  static const priceChangeNotInProgress = 'price_change_not_in_progress';

  /// Accepting (`PATCH /errands/:id/status` ACCEPTED) or paying
  /// (`POST /payments/:id/initiate`) an errand whose quote has expired (409,
  /// row 46). Details: `quoteId`, `expiresAt`. The customer needs a fresh
  /// quote (`x-awaiting-quote`).
  static const quoteExpired = 'quote_expired';

  /// The account is suspended or banned (401 on OTP verify; the app clears
  /// a running session the same way, `_shared.md` §7). Never show a reason.
  static const accountSuspended = 'account_suspended';

  /// Paying an ACCEPTED errand whose newest quote (an admin re-quote, row
  /// 72) is not accepted yet (409). Details: `quoteId`, `total`. Accept it
  /// with `ErrandRepository.acceptQuote`, then pay.
  static const quoteNotAccepted = 'quote_not_accepted';

  /// Accepting a quote while the task is no longer QUOTED / ACCEPTED (409).
  /// Details: `status`. Reload the task.
  static const quoteNotAcceptable = 'quote_not_acceptable';

  /// A quote cannot be replaced because the customer already started paying
  /// it (409, admin re-quote). Details: `paymentId`, `paymentStatus`.
  static const paymentInProgress = 'payment_in_progress';

  /// The task's state does not allow this transition (409), e.g. it moved
  /// on (another actor, a lost race, an expired offer). Details: `from`,
  /// `to` ([NitumeApiException.transitionFrom] / `transitionTo`). Reload
  /// the task.
  static const illegalTransition = 'illegal_transition';

  /// Runner accept (RUNNER_ASSIGNED → RUNNER_EN_ROUTE) after the offer's
  /// deadline (409, rows 141, 150), even before the task shows EXPIRED.
  /// Details: `offerExpiresAt` ([NitumeApiException.offerExpiresAt]).
  /// Remove the offer and reload.
  static const offerExpired = 'offer_expired';

  /// Someone else changed the task at the same time; reload and retry (409).
  static const concurrentModification = 'concurrent_modification';

  /// The task is not quoted yet (400).
  static const errandNotQuoted = 'errand_not_quoted';

  /// The task cannot be paid in its current state (409).
  static const errandNotPayable = 'errand_not_payable';

  /// The task is disputed; the action waits for the resolution (409).
  static const errandDisputed = 'errand_disputed';

  /// A dispute is already open for the task (409).
  static const disputeAlreadyExists = 'dispute_already_exists';

  /// The task cannot be rated in its current state (409).
  static const errandNotRateable = 'errand_not_rateable';

  /// The task is already rated (409).
  static const ratingAlreadyExists = 'rating_already_exists';

  /// The task has no runner to rate (409).
  static const noRunnerToRate = 'no_runner_to_rate';

  /// The phone number belongs to another account (409).
  static const phoneAlreadyRegistered = 'phone_already_registered';

  /// The signed-in user has no customer profile (409).
  static const customerProfileMissing = 'customer_profile_missing';

  /// Runner side (409): a price change is not allowed now.
  static const priceChangeNotAllowed = 'price_change_not_allowed';

  /// Runner side (409): a price change is already pending.
  static const priceChangeAlreadyPending = 'price_change_already_pending';

  /// Admin side (409): resolve-dispute on a task that is not disputed.
  static const errandNotDisputed = 'errand_not_disputed';

  /// Admin side (409): the decision rationale is too short.
  static const rationaleTooShort = 'rationale_too_short';

  /// System side (409): the task cannot be settled yet.
  static const errandNotSettleable = 'errand_not_settleable';

  /// System side (409): there is no payment to settle.
  static const noPaymentToSettle = 'no_payment_to_settle';

  /// System side (409): not every payment leg is complete.
  static const paymentLegsIncomplete = 'payment_legs_incomplete';

  /// `POST /errands`: Buy For Me / Get It For Me need a `budget` (0 allowed)
  /// (400, row 45).
  static const budgetRequired = 'budget_required';

  /// `POST /errands`: a positive `budget` on a category without one (400,
  /// row 45).
  static const budgetNotApplicable = 'budget_not_applicable';

  /// Retrying a price-change difference that is paid to the merchant
  /// directly, not by STK (409).
  static const differenceNotStk = 'difference_not_stk';

  /// No refund review exists for the errand (404 on
  /// `GET /errands/:id/refund`); `ErrandRepository.refund` maps it to
  /// `null`.
  static const refundNotFound = 'refund_not_found';

  /// `POST /errands/:id/quote/request`: a new quote was already requested
  /// (409, row 68). Details: `quoteRequestedAt`.
  /// `ErrandRepository.requestNewQuote` treats it as success.
  static const quoteRequestPending = 'quote_request_pending';

  /// `POST /errands/:id/quote/request` outside QUOTED / ACCEPTED or without
  /// a quote (409, row 68). Details: `status`. Reload the task.
  static const quoteRequestNotAllowed = 'quote_request_not_allowed';

  /// `POST /errands/:id/quote/request` while the newest quote is still valid
  /// (409, row 68). Details: `quoteId`, `expiresAt`. Reload and show
  /// checkout.
  static const quoteStillValid = 'quote_still_valid';

  /// Admin side (400, row 83): a quote expiry that is not in the future.
  static const quoteExpiryInPast = 'quote_expiry_in_past';

  /// Admin side (400, row 80): merchant Till/Paybill details on a category
  /// other than Buy For Me / Get It For Me.
  static const merchantDetailsNotApplicable = 'merchant_details_not_applicable';

  /// Runner side (400, row 80): a merchant amount (price change) on a
  /// category other than Buy For Me / Get It For Me.
  static const merchantAmountNotApplicable = 'merchant_amount_not_applicable';

  /// Admin side (409, row 82): the payout receipt of a refunded review is
  /// final.
  static const refundPayoutLocked = 'refund_payout_locked';

  /// `POST /runners/me/payout-requests`: the amount is below the
  /// ops-configured minimum (400, row 117). Details: `minimumAmount`
  /// ([NitumeApiException.minimumAmount]).
  static const payoutBelowMinimum = 'payout_below_minimum';

  /// `POST /runners/me/payout-requests`: the amount is above what is
  /// available (400). Details: `availableAmount`
  /// ([NitumeApiException.availableAmount]).
  static const payoutExceedsAvailable = 'payout_exceeds_available';

  /// `POST /runners/me/payout-requests`: a request is already open (409,
  /// one at a time, row 117). Details: `requestId`.
  static const payoutRequestOpen = 'payout_request_open';

  /// `POST /runners/me/payout-requests`: the account has no sign-in phone
  /// to pay to (409, row 118). Send the runner to Support.
  static const payoutDestinationMissing = 'payout_destination_missing';

  /// `POST /runners/me/verifications/documents`: the type is not
  /// `government_id` or `selfie` (400).
  static const verificationTypeNotUploadable =
      'verification_type_not_uploadable';

  /// `POST /runners/me/verifications/documents`: not a JPEG, PNG, WebP or
  /// HEIC image (400). Details: `allowed`.
  static const verificationDocumentTypeInvalid =
      'verification_document_type_invalid';

  /// `POST /runners/me/verifications/documents`: no file or an empty file
  /// (400).
  static const verificationDocumentEmpty = 'verification_document_empty';

  /// `POST /runners/me/verifications` for an ID or selfie, or with a storage
  /// key (400, row 154): upload the image with
  /// `RunnerAccountRepository.uploadVerificationDocument` instead.
  static const verificationDocumentUploadRequired =
      'verification_document_upload_required';
}
