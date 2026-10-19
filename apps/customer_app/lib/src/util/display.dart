import 'package:nitume_core/nitume_core.dart';

/// Display rules from `_shared.md` §7. Nothing here is stored or sent.

/// Task title (OA-15, row 41): `title` when set, else the category display
/// name. The client never composes a title from addresses.
String errandTitle(Errand errand) {
  final title = errand.title?.trim();
  if (title != null && title.isNotEmpty) return title;
  return errand.category.label;
}

/// `#NT-10482`, or `null` when the API sent no reference. Never derived.
String? errandReference(Errand errand) {
  final ref = errand.reference?.trim();
  if (ref == null || ref.isEmpty) return null;
  return '#$ref';
}

/// `#NT-10482 · Today, 10:03 AM` (either part may be missing).
String errandRefMeta(Errand errand, {DateTime? now}) {
  final parts = <String>[
    ?errandReference(errand),
    if (errand.createdAt != null) formatDayTime(errand.createdAt!, now: now),
  ];
  return parts.join(' · ');
}

/// Runner short name exactly as the API computes it (`Brian K.`, row 40).
/// `null` when the API has none (screens fall back to `Your runner`).
String? runnerShortName(RunnerSummary? runner) {
  final s = runner?.shortName?.trim();
  return s == null || s.isEmpty ? null : s;
}

/// "Verified" = `2_id_verified` or higher (v-task-detail Q4 default).
bool isVerified(VerificationLevel level) => level != VerificationLevel.basic;

/// `Verified · 4.9` (plus ` · 137 tasks` when [withCount]).
String runnerMeta(RunnerSummary runner, {bool withCount = false}) {
  final parts = <String>[
    if (isVerified(runner.verificationLevel)) 'Verified',
    formatRating(runner.avgRating),
    if (withCount) '${runner.errandsCompleted} tasks',
  ];
  return parts.join(' · ');
}

/// `Good morning` / `Good afternoon` / `Good evening` (v-home).
String greetingFor(DateTime now) {
  final h = now.hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/// First word of the display name, or `null`.
String? firstName(String? displayName) {
  final parts = displayName?.trim().split(RegExp(r'\s+'));
  if (parts == null || parts.isEmpty || parts.first.isEmpty) return null;
  return parts.first;
}

/// `+254 712 345 678` for a Kenyan number; the input when it cannot parse.
String formatPhoneIntl(String phone) {
  try {
    final n = KenyanPhone.normalize(phone);
    return '+254 ${n.substring(4, 7)} ${n.substring(7, 10)} ${n.substring(10)}';
  } on FormatException {
    return phone;
  }
}

/// `+254 712 ••• 678`: the masked form saved as a payment method `detail`.
String maskPhone(String phone) {
  try {
    final n = KenyanPhone.normalize(phone);
    return '+254 ${n.substring(4, 7)} ••• ${n.substring(10)}';
  } on FormatException {
    return phone;
  }
}

/// Adds two API decimal strings exactly (cents), e.g. service fee + runner
/// fee as returned by the API (v-payment "Amount"). Returns `0.00` form.
String addDecimals(String a, String b) {
  final cents = _toCents(a) + _toCents(b);
  final negative = cents < 0;
  final abs = cents.abs();
  final whole = abs ~/ 100;
  final frac = (abs % 100).toString().padLeft(2, '0');
  return '${negative ? '-' : ''}$whole.$frac';
}

/// Difference `b - a` of two API decimal strings (price change).
String subtractDecimals(String b, String a) => addDecimals(b, _negate(a));

/// True when the decimal string is greater than zero.
bool isPositiveAmount(String? value) =>
    value != null && _tryCents(value) != null && _tryCents(value)! > 0;

/// Digits-only amount for the clipboard (`40000`, `40000.50`).
String plainAmount(String value) {
  final cents = _toCents(value);
  final whole = cents ~/ 100;
  final frac = cents % 100;
  return frac == 0 ? '$whole' : '$whole.${frac.toString().padLeft(2, '0')}';
}

String _negate(String v) {
  final t = v.trim();
  return t.startsWith('-') ? t.substring(1) : '-$t';
}

int _toCents(String value) => _tryCents(value) ?? 0;

int? _tryCents(String value) {
  final m = RegExp(r'^([+-])?(\d+)(?:\.(\d{1,}))?$')
      .firstMatch(value.trim().replaceAll(',', ''));
  if (m == null) return null;
  final whole = int.parse(m.group(2)!);
  final fracRaw = (m.group(3) ?? '').padRight(2, '0').substring(0, 2);
  final cents = whole * 100 + int.parse(fracRaw);
  return m.group(1) == '-' ? -cents : cents;
}

/// Customer-facing messages for an API failure (`_shared.md` §7).
String friendlyError(Object error) {
  if (error is NitumeApiException && error.isNetworkError) {
    return 'Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/// Status code of an API failure, if any.
int? statusOf(Object error) =>
    error is NitumeApiException ? error.statusCode : null;

/// Home active-card meta line by state (v-home, proposed copy).
String activeCardMeta(Errand errand) {
  final name = runnerShortName(errand.runner) ?? 'Your runner';
  return switch (errand.status) {
    ErrandStatus.requested => 'Waiting for your quote',
    ErrandStatus.quoted => 'Your quote is ready',
    ErrandStatus.accepted => 'Pay to confirm your task',
    ErrandStatus.paymentConfirmed => 'Finding a runner',
    // No runner name before acceptance (rows 176, 183).
    ErrandStatus.runnerAssigned => 'Finding a runner',
    ErrandStatus.runnerEnRoute => '$name is en route',
    ErrandStatus.arrived => '$name has arrived',
    ErrandStatus.inProgress => '$name is on it',
    ErrandStatus.awaitingCustomer => 'Ready for your review',
    _ => statusPresentation(errand.status).label,
  };
}

/// Home active-card button by state (v-home table).
String activeCardAction(ErrandStatus status) => switch (status) {
  ErrandStatus.requested => 'View request →',
  ErrandStatus.quoted => 'Review quote →',
  ErrandStatus.accepted => 'Pay now →',
  ErrandStatus.awaitingCustomer => 'Review evidence →',
  _ => 'Track live →',
};

/// What the fee STK charges, from the API's legs: service + runner fee, plus
/// the item amount for `send_to_runner` (one combined STK, row 76).
String chargedAmount(Payment p) {
  final fees = addDecimals(p.serviceFee, p.runnerFee);
  return p.paymentFlow == PaymentFlow.customerToRunner
      ? addDecimals(fees, p.merchantAmount)
      : fees;
}

/// A default-deadline length for copy: `24 hours`, `1 hour`; other lengths
/// as `1 h 30 min` (`v-new-details` Flexible caption, rows 221, 235).
String formatHours(Duration duration) {
  final minutes = duration.inMinutes;
  if (minutes > 0 && minutes % 60 == 0) {
    final h = minutes ~/ 60;
    return h == 1 ? '1 hour' : '$h hours';
  }
  return formatDurationMin(duration);
}
