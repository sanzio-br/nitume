/// Display formatters for numeric data (`_shared.md` §7). Render the results
/// with `NumText` / `NitumeTypography.numeric` (Fira Code).
library;

/// Placeholder shown when a value is missing (`v-history`: runner / amount).
const String kMissingValue = '—';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Formats a Kenyan-shilling amount as `KSh 2,200`.
///
/// [amount] may be a [num] or a decimal string as returned by the API
/// (`numeric(12,2)`, e.g. `"2200.00"`). Decimals are shown only when non-zero
/// (`KSh 2,200.50`). With [signed], positive values get a `+ ` prefix
/// (`+ KSh 5,000`); negative values always get `- `.
///
/// Throws [FormatException] for a non-numeric string.
String formatKes(Object amount, {bool signed = false}) {
  final parts = _DecimalParts.parse(amount);
  final body = 'KSh ${parts.grouped}';
  if (parts.isNegative) return '- $body';
  if (signed && !parts.isZero) return '+ $body';
  return body;
}

/// [formatKes], or [kMissingValue] when [amount] is null.
String formatKesOrDash(Object? amount) =>
    amount == null ? kMissingValue : formatKes(amount);

/// Groups an amount without the currency prefix: `40,000`
/// (`v-price-auth` compare row).
String formatAmount(Object amount) {
  final parts = _DecimalParts.parse(amount);
  return parts.isNegative ? '-${parts.grouped}' : parts.grouped;
}

/// `10:03 AM`.
String formatClock(DateTime time) {
  final t = time.toLocal();
  final hour12 = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final minute = t.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// `Today, 10:03 AM`, `Yesterday, 4:12 PM`, `Mon, 10:03 AM` (within the last
/// week), otherwise `12 Feb, 10:03 AM` (`12 Feb 2025, …` in another year).
String formatDayTime(DateTime time, {DateTime? now}) {
  final t = time.toLocal();
  final ref = (now ?? DateTime.now()).toLocal();
  final days = _calendarDaysBetween(t, ref);
  final clock = formatClock(t);
  if (days == 0) return 'Today, $clock';
  if (days == 1) return 'Yesterday, $clock';
  if (days > 1 && days < 7) return '${_weekdays[t.weekday - 1]}, $clock';
  return '${formatShortDate(t, now: ref)}, $clock';
}

/// Notification-style relative time: `2m`, `1h` (same day), `Yesterday`,
/// `Mon` (within the last week), otherwise `12 Feb`.
String formatRelativeShort(DateTime time, {DateTime? now}) {
  final t = time.toLocal();
  final ref = (now ?? DateTime.now()).toLocal();
  final days = _calendarDaysBetween(t, ref);
  if (days <= 0) {
    final diff = ref.difference(t);
    if (diff.inMinutes < 60) {
      final m = diff.inMinutes < 1 ? 1 : diff.inMinutes;
      return '${m}m';
    }
    return '${diff.inHours}h';
  }
  if (days == 1) return 'Yesterday';
  if (days < 7) return _weekdays[t.weekday - 1];
  return formatShortDate(t, now: ref);
}

/// `12 Feb`, or `12 Feb 2025` when not in [now]'s year.
String formatShortDate(DateTime time, {DateTime? now}) {
  final t = time.toLocal();
  final ref = (now ?? DateTime.now()).toLocal();
  final base = '${t.day} ${_months[t.month - 1]}';
  return t.year == ref.year ? base : '$base ${t.year}';
}

/// `Feb 2026` (`Customer since Feb 2026`).
String formatMonthYear(DateTime time) {
  final t = time.toLocal();
  return '${_months[t.month - 1]} ${t.year}';
}

/// `ETA 12 min`. Rounds up to whole minutes, minimum 1.
String formatEta(Duration eta) {
  final seconds = eta.inSeconds;
  final minutes = seconds <= 0 ? 1 : (seconds / 60).ceil();
  return 'ETA $minutes min';
}

/// Progress counter `3/5`.
String formatCounter(int done, int total) => '$done/$total';

/// Rating with one decimal: `"4.90"` → `4.9`, `5` → `5.0`.
String formatRating(Object rating) {
  final value = rating is num ? rating : num.parse(rating.toString());
  return value.toStringAsFixed(1);
}

int _calendarDaysBetween(DateTime a, DateTime b) {
  final da = DateTime.utc(a.year, a.month, a.day);
  final db = DateTime.utc(b.year, b.month, b.day);
  return db.difference(da).inDays;
}

/// Exact decimal handling on the string form, so API decimal strings are
/// never routed through floating point.
class _DecimalParts {
  _DecimalParts(this.isNegative, this.integer, this.fraction);

  final bool isNegative;
  final String integer;
  final String fraction;

  static final _pattern = RegExp(r'^([+-])?(\d+)(?:\.(\d+))?$');

  factory _DecimalParts.parse(Object amount) {
    final raw = amount is num ? amount.toStringAsFixed(2) : '$amount'.trim();
    final m = _pattern.firstMatch(raw.replaceAll(',', ''));
    if (m == null) throw FormatException('Not an amount', raw);
    final integer = m.group(2)!.replaceFirst(RegExp(r'^0+(?=\d)'), '');
    var fraction = (m.group(3) ?? '').padRight(2, '0');
    if (fraction.length > 2) fraction = fraction.substring(0, 2);
    final zero = RegExp(r'^0+$').hasMatch(integer) && fraction == '00';
    return _DecimalParts(m.group(1) == '-' && !zero, integer, fraction);
  }

  bool get isZero =>
      RegExp(r'^0+$').hasMatch(integer) && fraction == '00';

  String get grouped {
    final buf = StringBuffer();
    for (var i = 0; i < integer.length; i++) {
      if (i > 0 && (integer.length - i) % 3 == 0) buf.write(',');
      buf.write(integer[i]);
    }
    if (fraction != '00') buf.write('.$fraction');
    return buf.toString();
  }
}
