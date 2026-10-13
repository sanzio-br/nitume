import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../utils/phone.dart';

/// `+254 712 345 678` for a Kenyan number; the input when it cannot parse.
String formatPhoneIntl(String phone) {
  try {
    final n = KenyanPhone.normalize(phone);
    return '+254 ${n.substring(4, 7)} ${n.substring(7, 10)} ${n.substring(10)}';
  } on FormatException {
    return phone;
  }
}

/// Generic user-facing message for an API failure (`_shared.md` §7, both
/// surfaces).
String friendlyError(Object error) {
  if (error is NitumeApiException && error.isNetworkError) {
    return 'Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/// Replaces any visible snackbar with [message].
void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
