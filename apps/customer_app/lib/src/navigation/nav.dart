import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../services/app_services.dart';
import '../services/shell_controller.dart';

/// Route names. Screens are registered in `routes.dart`.
abstract final class Routes {
  static const otp = '/auth/otp';
  static const newTask = '/task/new';
  static const awaitingQuote = '/task/quote';
  static const payment = '/task/payment';
  static const merchantPayment = '/task/merchant-payment';
  static const taskDetail = '/task/detail';
  static const evidenceConfirm = '/task/evidence';
  static const rate = '/task/rate';
  static const reportProblem = '/task/report';
  static const notifications = '/notifications';
  static const addresses = '/addresses';
  static const addressForm = '/addresses/form';
  static const paymentMethods = '/payment-methods';
  static const paymentMethodForm = '/payment-methods/form';
}

/// `v-auth-otp` arguments.
class OtpArgs {
  const OtpArgs({required this.phone, this.cooldown});

  /// Normalized `+2547XXXXXXXX`.
  final String phone;

  /// Remaining resend cooldown, when the phone screen hit one.
  final Duration? cooldown;
}

/// `v-payment` arguments.
class PaymentArgs {
  const PaymentArgs({
    required this.errandId,
    this.route,
    this.method,
    this.fromCheckout = false,
  });

  final String errandId;

  /// True when the customer just tapped "Confirm & pay": a new STK push may
  /// be sent. Otherwise the screen only shows the current payment state.
  final bool fromCheckout;

  /// Merchant route chosen at checkout (OA-5); `null` when unknown.
  final MerchantRoute? route;

  /// Method chosen at checkout; `null` = API default, then sign-in phone.
  final PaymentMethod? method;
}

/// `x-merchant-payment` arguments.
class MerchantPaymentArgs {
  const MerchantPaymentArgs({
    required this.errandId,
    this.approvedIncrease,
    this.priceChangeRequestId,
  });

  /// The price-change request the difference belongs to (enables the
  /// variant B retry, `retryDifferencePayment`).
  final String? priceChangeRequestId;

  final String errandId;

  /// Increase the customer just approved (price change), as a decimal string.
  final String? approvedIncrease;
}

/// `x-report-problem` arguments.
class ReportArgs {
  const ReportArgs({required this.errand, required this.readMode});

  final Errand errand;
  final bool readMode;
}

/// `v-payment-methods` arguments.
class PaymentMethodsArgs {
  const PaymentMethodsArgs({this.selectMode = false, this.selectedId});

  final bool selectMode;
  final String? selectedId;
}

/// Typed navigation for every customer screen (`_shared.md` §1). Pushed
/// screens cover the shell (tab bar hidden); root tabs switch through the
/// [ShellController].
abstract final class Nav {
  static Future<T?> _push<T>(BuildContext context, String name, [Object? a]) =>
      Navigator.of(context).pushNamed<T>(name, arguments: a);

  static Future<T?> _replace<T>(
    BuildContext context,
    String name, [
    Object? a,
  ]) =>
      Navigator.of(context)
          .pushReplacementNamed<T, Object?>(name, arguments: a);

  /// Pops every pushed screen back to the shell (or the signed-out root).
  static void popToRoot(BuildContext context) =>
      Navigator.of(context).popUntil((r) => r.isFirst);

  // ---- auth -----------------------------------------------------------------

  static Future<void> toOtp(
    BuildContext context, {
    required String phone,
    Duration? cooldown,
  }) => _push(context, Routes.otp, OtpArgs(phone: phone, cooldown: cooldown));

  // ---- shell ----------------------------------------------------------------

  /// Resets the stack to the shell on [tab] (rating submitted, task
  /// cancelled).
  static void resetTo(BuildContext context, ShellTab tab) {
    context.services.shell.reset(tab);
    popToRoot(context);
  }

  /// Resets the stack to the shell with Track on [errandId] (OA-21).
  static void resetToTrack(
    BuildContext context,
    String? errandId, {
    bool openPriceChange = false,
  }) {
    context.services.shell.showTrack(
      errandId,
      openPriceChange: openPriceChange,
    );
    popToRoot(context);
  }

  /// Deep link for a notification row or a tapped push (`v-notifications`
  /// table). Unknown types open Task detail when an errand is set.
  static Future<void> openNotification(
    BuildContext context, {
    required String? eventType,
    required String? errandId,
  }) async {
    final id = errandId;
    if (id == null) return;
    final event = eventType == null
        ? null
        : NotificationEventType.tryFromWire(eventType);
    switch (event) {
      case NotificationEventType.quoted:
      case NotificationEventType.quoteReissued:
        await toAwaitingQuote(context, id);
      case NotificationEventType.merchantDetailsAdded:
        // Checkout while QUOTED / ACCEPTED, else the item payment screen.
        await _openMerchantDetails(context, id);
      case NotificationEventType.runnerAssigned:
      case NotificationEventType.runnerEnRoute:
      case NotificationEventType.arrived:
      case NotificationEventType.inProgress:
        resetToTrack(context, id);
      case NotificationEventType.priceChangeRequested:
        // Track opens the blocking modal if the request is still pending.
        resetToTrack(context, id, openPriceChange: true);
      case NotificationEventType.awaitingCustomer:
        // The screen switches to Task detail when no longer awaiting.
        await toEvidenceConfirm(context, id);
      case NotificationEventType.refundApproved:
      case NotificationEventType.refundNoRefund:
      case NotificationEventType.refundRefunded:
      case NotificationEventType.completed:
      case NotificationEventType.disputed:
      case NotificationEventType.cancelled:
      case NotificationEventType.failed:
      case null:
        await toTaskDetail(context, id);
    }
  }

  // ---- wizard ---------------------------------------------------------------

  /// Pushes `v-new-category`, optionally with [category] preselected.
  static Future<void> toNewTask(
    BuildContext context, {
    ErrandCategory? category,
  }) => _push(context, Routes.newTask, category);

  // ---- checkout -------------------------------------------------------------

  static Future<void> toAwaitingQuote(BuildContext context, String errandId) =>
      _push(context, Routes.awaitingQuote, errandId);

  /// [quoteExpired]: the API answered `quote_expired` (row 46).
  static Future<void> replaceWithAwaitingQuote(
    BuildContext context,
    String errandId, {
    bool quoteExpired = false,
  }) => _replace(
    context,
    Routes.awaitingQuote,
    quoteExpired ? (errandId, true) : errandId,
  );

  /// Shows the current payment state (Home / Task detail "Pay now").
  static Future<void> toPayment(BuildContext context, String errandId) =>
      _push(context, Routes.payment, PaymentArgs(errandId: errandId));

  /// Checkout CTA: pay with [route] and [method] (OA-5, OA-21).
  static Future<void> toCheckoutPayment(
    BuildContext context,
    String errandId, {
    MerchantRoute? route,
    PaymentMethod? method,
  }) => _push(
    context,
    Routes.payment,
    PaymentArgs(
      errandId: errandId,
      route: route,
      method: method,
      fromCheckout: true,
    ),
  );

  static Future<void> replaceWithPayment(
    BuildContext context,
    String errandId,
  ) => _replace(context, Routes.payment, PaymentArgs(errandId: errandId));

  static Future<void> toMerchantPayment(
    BuildContext context,
    String errandId, {
    String? approvedIncrease,
    String? priceChangeRequestId,
  }) => _push(
    context,
    Routes.merchantPayment,
    MerchantPaymentArgs(
      errandId: errandId,
      approvedIncrease: approvedIncrease,
      priceChangeRequestId: priceChangeRequestId,
    ),
  );

  // ---- task -----------------------------------------------------------------

  static Future<void> toTaskDetail(BuildContext context, String errandId) =>
      _push(context, Routes.taskDetail, errandId);

  static Future<void> replaceWithTaskDetail(
    BuildContext context,
    String errandId,
  ) => _replace(context, Routes.taskDetail, errandId);

  static Future<void> toEvidenceConfirm(
    BuildContext context,
    String errandId,
  ) => _push(context, Routes.evidenceConfirm, errandId);

  static Future<void> toRate(BuildContext context, String errandId) =>
      _push(context, Routes.rate, errandId);

  static Future<void> replaceWithRate(BuildContext context, String errandId) =>
      _replace(context, Routes.rate, errandId);

  /// Write mode. Resolves `true` when a report was sent.
  static Future<bool?> toReportProblem(BuildContext context, Errand errand) =>
      _push<bool>(
        context,
        Routes.reportProblem,
        ReportArgs(errand: errand, readMode: false),
      );

  /// Read mode (`View your report`).
  static Future<void> toReport(BuildContext context, Errand errand) => _push(
    context,
    Routes.reportProblem,
    ReportArgs(errand: errand, readMode: true),
  );

  /// Opens the screen for the errand's current state (Home active card,
  /// Task detail primary action).
  static Future<void> openForStatus(BuildContext context, Errand errand) {
    switch (errand.status) {
      case ErrandStatus.requested:
      case ErrandStatus.quoted:
        return toAwaitingQuote(context, errand.id);
      case ErrandStatus.accepted:
        return toPayment(context, errand.id);
      case ErrandStatus.paymentConfirmed:
      case ErrandStatus.runnerAssigned:
      case ErrandStatus.runnerEnRoute:
      case ErrandStatus.arrived:
      case ErrandStatus.inProgress:
        resetToTrack(context, errand.id);
        return Future.value();
      case ErrandStatus.awaitingCustomer:
        return toEvidenceConfirm(context, errand.id);
      default:
        return toTaskDetail(context, errand.id);
    }
  }

  static Future<void> _openMerchantDetails(
    BuildContext context,
    String id,
  ) async {
    final Errand errand;
    try {
      errand = await context.services.errands.get(id);
    } on Object {
      if (context.mounted) await toTaskDetail(context, id);
      return;
    }
    if (!context.mounted) return;
    if (errand.status == ErrandStatus.quoted ||
        errand.status == ErrandStatus.accepted) {
      await toAwaitingQuote(context, id);
    } else {
      await toMerchantPayment(context, id);
    }
  }

  // ---- account --------------------------------------------------------------

  static Future<void> toNotifications(BuildContext context) =>
      _push(context, Routes.notifications);

  static Future<void> toAddresses(BuildContext context) =>
      _push(context, Routes.addresses);

  /// Resolves with a snackbar message when something was saved or deleted.
  static Future<String?> toAddressForm(
    BuildContext context, {
    SavedAddress? address,
  }) => _push<String>(context, Routes.addressForm, address);

  static Future<void> toPaymentMethods(BuildContext context) =>
      _push(context, Routes.paymentMethods, const PaymentMethodsArgs());

  /// Select mode (checkout "Change"): resolves with the chosen method.
  static Future<PaymentMethod?> selectPaymentMethod(
    BuildContext context, {
    String? selectedId,
  }) => _push<PaymentMethod>(
    context,
    Routes.paymentMethods,
    PaymentMethodsArgs(selectMode: true, selectedId: selectedId),
  );

  /// Resolves with a snackbar message when something was saved or removed.
  static Future<String?> toPaymentMethodForm(
    BuildContext context, {
    PaymentMethod? method,
  }) => _push<String>(context, Routes.paymentMethodForm, method);
}
