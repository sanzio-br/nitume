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

/// Countdown `m:ss`, e.g. `0:42`, `1:00` (OTP resend cooldown).
String formatCountdown(Duration remaining) {
  final total = remaining.isNegative ? 0 : remaining.inSeconds;
  final seconds = (total % 60).toString().padLeft(2, '0');
  return '${total ~/ 60}:$seconds';
}

/// Progress counter `3/5`.
String formatCounter(int done, int total) => '$done/$total';

/// Rating with one decimal: `"4.90"` → `4.9`, `5` → `5.0`.
String formatRating(Object rating) {
  final value = rating is num ? rating : num.parse(rating.toString());
  return value.toStringAsFixed(1);
}

// ---------------------------------------------------------------------------
// R-18. Runner times in East Africa Time, distances and durations
// (`docs/specs/runner/_shared.md` §7, RQ-10). The API stays UTC; these
// always render Africa/Nairobi wall-clock time (UTC+3, no daylight saving)
// regardless of the device time zone.
// ---------------------------------------------------------------------------

/// Offset of East Africa Time (Africa/Nairobi) from UTC. Kenya has no
/// daylight saving time, so the offset is fixed.
const Duration kEatOffset = Duration(hours: 3);

/// [time] as an EAT wall-clock value. The result is a UTC [DateTime] whose
/// fields (year … minute, weekday) read as Nairobi local time; use it only
/// for display and day bucketing, never send it to the API.
DateTime toEatWallClock(DateTime time) => time.toUtc().add(kEatOffset);

String _clock12(DateTime wall) {
  final hour12 = wall.hour % 12 == 0 ? 12 : wall.hour % 12;
  final minute = wall.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${wall.hour < 12 ? 'AM' : 'PM'}';
}

/// `10:28 AM` in EAT.
String formatClockEat(DateTime time) => _clock12(toEatWallClock(time));

/// `Today, 10:28 AM`, `Yesterday, 4:12 PM`, `Mon, 10:28 AM` (within the
/// last week), otherwise `12 Feb, 10:28 AM` (`12 Feb 2025, …` in another
/// year). Days are EAT calendar days.
String formatDayTimeEat(DateTime time, {DateTime? now}) {
  final t = toEatWallClock(time);
  final ref = toEatWallClock(now ?? DateTime.now());
  final days = _calendarDaysBetween(t, ref);
  final clock = _clock12(t);
  if (days == 0) return 'Today, $clock';
  if (days == 1) return 'Yesterday, $clock';
  if (days > 1 && days < 7) return '${_weekdays[t.weekday - 1]}, $clock';
  final date = '${t.day} ${_months[t.month - 1]}';
  return t.year == ref.year ? '$date, $clock' : '$date ${t.year}, $clock';
}

/// Future-aware EAT time for deadlines and due times (customer m-1):
/// `Today, 11:59 PM`, `Tomorrow, 11:59 PM`, `Yesterday, 4:12 PM`,
/// otherwise the date: `24 Oct, 11:59 PM` (`3 Jan 2027, …` in another
/// year). Days are EAT calendar days. Use [formatDayTimeEat] for times in
/// the past (activity, history).
String formatDeadlineEat(DateTime time, {DateTime? now}) {
  final t = toEatWallClock(time);
  final ref = toEatWallClock(now ?? DateTime.now());
  final ahead = -_calendarDaysBetween(t, ref);
  final clock = _clock12(t);
  if (ahead == 0) return 'Today, $clock';
  if (ahead == 1) return 'Tomorrow, $clock';
  if (ahead == -1) return 'Yesterday, $clock';
  final date = '${t.day} ${_months[t.month - 1]}';
  return t.year == ref.year ? '$date, $clock' : '$date ${t.year}, $clock';
}

/// Notification-style relative time on EAT days: `2m`, `1h` (same day),
/// `Yesterday`, `Mon` (within the last week), otherwise `12 Feb`.
String formatRelativeShortEat(DateTime time, {DateTime? now}) {
  final t = toEatWallClock(time);
  final ref = toEatWallClock(now ?? DateTime.now());
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
  final date = '${t.day} ${_months[t.month - 1]}';
  return t.year == ref.year ? date : '$date ${t.year}';
}

/// EAT calendar day of [time] as `YYYY-MM-DD` (matches the API's EAT
/// day buckets, e.g. the weekly earnings `week[].day`).
String eatDayKey(DateTime time) {
  final t = toEatWallClock(time);
  final m = t.month.toString().padLeft(2, '0');
  final d = t.day.toString().padLeft(2, '0');
  return '${t.year.toString().padLeft(4, '0')}-$m-$d';
}

/// EAT weekday of [time]: [DateTime.monday] (1) … [DateTime.sunday] (7).
int eatWeekday(DateTime time) => toEatWallClock(time).weekday;

/// Start of the EAT week holding [time] (Monday 00:00 EAT), as a UTC
/// instant (Sunday 21:00 UTC).
DateTime eatWeekStart(DateTime time) {
  final t = toEatWallClock(time);
  final monday = DateTime.utc(t.year, t.month, t.day - (t.weekday - 1));
  return monday.subtract(kEatOffset);
}

/// Distance in kilometres for display: `1.2 km`, or metres under 1 km
/// rounded to 10 m (`850 m`). Negative input is treated as 0.
String formatDistanceKm(num km) {
  final meters = km <= 0 ? 0 : km * 1000;
  if (meters < 995) {
    final rounded = ((meters / 10).round() * 10).toInt();
    return '$rounded m';
  }
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

/// Duration in whole minutes, rounded up (minimum 1): `6 min`, `45 min`,
/// `1 h 10 min`, `2 h`.
String formatDurationMin(Duration duration) {
  final seconds = duration.inSeconds;
  final minutes = seconds <= 0 ? 1 : (seconds / 60).ceil();
  if (minutes < 60) return '$minutes min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '$h h' : '$h h $m min';
}

/// Signed ledger amount as drawn on the runner payout rows: `+ KSh 1,750`,
/// `− KSh 6,000` (U+2212 minus), `KSh 0`. [amount] is a [num] or a signed
/// API decimal string.
String formatKesLedger(Object amount) {
  final parts = _DecimalParts.parse(amount);
  final body = 'KSh ${parts.grouped}';
  if (parts.isZero) return body;
  return parts.isNegative ? '\u2212 $body' : '+ $body';
}

/// Spoken form of a shilling amount for semantics labels (`_shared.md`
/// §11): `1,750 shillings`, `minus 6,000 shillings`.
String kesSemanticsLabel(Object amount) {
  final parts = _DecimalParts.parse(amount);
  final body = '${parts.grouped} shillings';
  return parts.isNegative ? 'minus $body' : body;
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

  bool get isZero => RegExp(r'^0+$').hasMatch(integer) && fraction == '00';

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
