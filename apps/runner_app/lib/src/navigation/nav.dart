import 'package:flutter/material.dart';

/// Route names. Screens are registered in `routes.dart`.
abstract final class Routes {
  static const otp = '/auth/otp';
}

/// `v-auth-otp` arguments.
class OtpArgs {
  const OtpArgs({required this.phone, this.cooldown});

  /// Normalized `+2547XXXXXXXX`.
  final String phone;

  /// Remaining resend cooldown, when the phone screen hit one.
  final Duration? cooldown;
}

/// Typed navigation for runner screens (`_shared.md` §1).
abstract final class Nav {
  static Future<T?> _push<T>(BuildContext context, String name, [Object? a]) =>
      Navigator.of(context).pushNamed<T>(name, arguments: a);

  /// Pops every pushed screen back to the shell (or the signed-out root).
  static void popToRoot(BuildContext context) =>
      Navigator.of(context).popUntil((r) => r.isFirst);

  static Future<void> toOtp(
    BuildContext context, {
    required String phone,
    Duration? cooldown,
  }) => _push(context, Routes.otp, OtpArgs(phone: phone, cooldown: cooldown));
}
