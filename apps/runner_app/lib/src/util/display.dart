import 'package:flutter/painting.dart';
import 'package:nitume_core/nitume_core.dart';

/// Display rules from `_shared.md` §7. Nothing here is stored or sent.
///
// TODO(core-ui): these mirror `apps/customer_app/lib/src/util/display.dart`;
// switch to the nitume_core versions once they are promoted.

/// `+254 733 111 222` for a Kenyan number; the input when it cannot parse.
String formatPhoneIntl(String phone) {
  try {
    final n = KenyanPhone.normalize(phone);
    return '+254 ${n.substring(4, 7)} ${n.substring(7, 10)} ${n.substring(10)}';
  } on FormatException {
    return phone;
  }
}

/// Generic message for an API failure (`_shared.md` §7).
String friendlyError(Object error) {
  if (error is NitumeApiException && error.isNetworkError) {
    return 'Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/// Wrong account type (RQ-15, `v-auth-otp`).
const wrongAccountMessage =
    'This number is registered as a customer account. '
    'Use another number, or contact support.';

/// Suspended or banned account (`_shared.md` §7).
const suspendedMessage = "This account can't sign in. Contact support.";

/// The most the runner may spend on the item (row 248): `requiredPurchase`
/// on `send_to_runner` (it stays at the old amount while
/// `differenceAwaitingPayment` is set, although `itemAmount` is already the
/// new price); the item amount otherwise (Nitume pays the merchant).
String? amountToSpend(RunnerJobView job) =>
    job.merchantRoute == MerchantRoute.sendToRunner
    ? job.requiredPurchase
    : job.itemAmount;

/// `RunnerEvidenceCopy.tooLarge(maxBytes)` with the size in Fira Code
/// (row 252).
InlineSpan evidenceTooLargeSpan(int maxBytes) {
  final full = RunnerEvidenceCopy.tooLarge(maxBytes);
  final limit = RunnerEvidenceCopy.tooLargeLimit(maxBytes);
  final at = full.indexOf(limit);
  if (at < 0) return TextSpan(text: full);
  return TextSpan(
    children: [
      TextSpan(text: full.substring(0, at)),
      NumSpan(limit),
      TextSpan(text: full.substring(at + limit.length)),
    ],
  );
}
