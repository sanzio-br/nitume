import 'package:flutter/material.dart';

import '../screens/auth/otp_screen.dart';
import 'nav.dart';

/// Builds the pushed screen for a [Routes] name.
Route<dynamic>? onGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;
  final Widget? screen = switch (settings.name) {
    Routes.otp => () {
      final a = args! as OtpArgs;
      return OtpScreen(phone: a.phone, initialCooldown: a.cooldown);
    }(),
    _ => null,
  };
  if (screen == null) return null;
  return MaterialPageRoute<dynamic>(settings: settings, builder: (_) => screen);
}
