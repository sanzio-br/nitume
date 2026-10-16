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
