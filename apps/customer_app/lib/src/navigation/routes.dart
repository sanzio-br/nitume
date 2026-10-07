import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../screens/auth/otp_screen.dart';
import '../screens/checkout/awaiting_quote_screen.dart';
import '../screens/checkout/merchant_payment_screen.dart';
import '../screens/checkout/payment_screen.dart';
import '../screens/wizard/category_screen.dart';
import 'nav.dart';

/// Builds the pushed screen for a [Routes] name.
Route<dynamic>? onGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;
  final Widget? screen = switch (settings.name) {
    Routes.otp => () {
      final a = args! as OtpArgs;
      return OtpScreen(phone: a.phone, initialCooldown: a.cooldown);
    }(),
    Routes.newTask => CategoryScreen(initialCategory: args as ErrandCategory?),
    Routes.awaitingQuote => AwaitingQuoteScreen(errandId: args! as String),
    Routes.payment => PaymentScreen(args: args! as PaymentArgs),
    Routes.merchantPayment => () {
      final a = args! as MerchantPaymentArgs;
      return MerchantPaymentScreen(
        errandId: a.errandId,
        approvedIncrease: a.approvedIncrease,
      );
    }(),
    _ => null,
  };
  if (screen == null) return null;
  return MaterialPageRoute<dynamic>(settings: settings, builder: (_) => screen);
}
