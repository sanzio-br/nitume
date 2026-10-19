import 'package:flutter/material.dart';

import '../screens/auth/otp_screen.dart';
import '../screens/location/location_disclosure_screen.dart';
import '../screens/onboarding/onboard_id_screen.dart';
import '../screens/onboarding/onboard_pending_screen.dart';
import '../screens/onboarding/onboard_selfie_screen.dart';
import 'nav.dart';

/// Builds the pushed screen for a [Routes] name.
Route<dynamic>? onGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;
  final Widget? screen = switch (settings.name) {
    Routes.otp => () {
      final a = args! as OtpArgs;
      return OtpScreen(phone: a.phone, initialCooldown: a.cooldown);
    }(),
    Routes.onboardId => () {
      final a = args is OnboardIdArgs ? args : const OnboardIdArgs();
      return OnboardIdScreen(firstRun: a.firstRun, initialSide: a.side);
    }(),
    Routes.onboardSelfie => const OnboardSelfieScreen(),
    Routes.onboardPending => const OnboardPendingScreen(),
    Routes.locationDisclosure => const LocationDisclosureScreen(),
    _ => null,
  };
  if (screen == null) return null;
  return MaterialPageRoute<dynamic>(settings: settings, builder: (_) => screen);
}
