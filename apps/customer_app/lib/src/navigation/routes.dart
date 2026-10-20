import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../screens/account/address_form_screen.dart';
import '../screens/account/addresses_screen.dart';
import '../screens/account/notifications_screen.dart';
import '../screens/account/payment_method_form_screen.dart';
import '../screens/account/payment_methods_screen.dart';
import '../screens/auth/otp_screen.dart';
import '../screens/checkout/awaiting_quote_screen.dart';
import '../screens/checkout/merchant_payment_screen.dart';
import '../screens/checkout/payment_screen.dart';
import '../screens/task/evidence_confirm_screen.dart';
import '../screens/task/rate_screen.dart';
import '../screens/task/report_problem_screen.dart';
import '../screens/task/task_detail_screen.dart';
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
    Routes.awaitingQuote => switch (args) {
      final AwaitingQuoteArgs a => AwaitingQuoteScreen(
        errandId: a.errandId,
        quoteExpired: a.quoteExpired,
        deadlinePassed: a.deadlinePassed,
      ),
      _ => AwaitingQuoteScreen(errandId: args! as String),
    },
    Routes.payment => PaymentScreen(args: args! as PaymentArgs),
    Routes.merchantPayment => () {
      final a = args! as MerchantPaymentArgs;
      return MerchantPaymentScreen(
        errandId: a.errandId,
        approvedIncrease: a.approvedIncrease,
        priceChangeRequestId: a.priceChangeRequestId,
      );
    }(),
    Routes.taskDetail => TaskDetailScreen(errandId: args! as String),
    Routes.evidenceConfirm => EvidenceConfirmScreen(errandId: args! as String),
    Routes.rate => RateScreen(errandId: args! as String),
    Routes.reportProblem => () {
      final a = args! as ReportArgs;
      return a.readMode
          ? ReportProblemScreen.read(errand: a.errand)
          : ReportProblemScreen.write(errand: a.errand);
    }(),
    Routes.notifications => const NotificationsScreen(),
    Routes.addresses => const AddressesScreen(),
    Routes.addressForm => AddressFormScreen(address: args as SavedAddress?),
    Routes.paymentMethods => () {
      final a = args as PaymentMethodsArgs? ?? const PaymentMethodsArgs();
      return PaymentMethodsScreen(
        selectMode: a.selectMode,
        selectedId: a.selectedId,
      );
    }(),
    Routes.paymentMethodForm => PaymentMethodFormScreen(
      method: args as PaymentMethod?,
    ),
    _ => null,
  };
  if (screen == null) return null;
  return MaterialPageRoute<dynamic>(settings: settings, builder: (_) => screen);
}
