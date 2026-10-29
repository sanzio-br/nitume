// Display formatters for numeric data (ui-kit spec §5.2). Exact ports of
// packages/nitume_core/lib/src/utils/formatters.dart and
// app_support/display.dart. Render the results through `nmNum` (Fira Code).
//
// Clocks (WQ-2 still open, spec default): customer activity/history times use
// the browser's local zone; customer deadlines and every runner time use EAT.

/** Placeholder shown when a value is missing. */
export const MISSING_VALUE = '—';

/** A money amount: a number or an API decimal string (`"2200.00"`). */
export type Amount = number | string;

/** A point in time: a `Date`, an ISO string or epoch milliseconds. */
export type DateInput = Date | string | number;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Offset of East Africa Time (Africa/Nairobi) from UTC; no daylight saving. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Money (decimal string, never floating point)
// ---------------------------------------------------------------------------

interface DecimalParts {
  readonly negative: boolean;
  readonly integer: string;
  readonly fraction: string;
}

const AMOUNT_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

function parseAmount(amount: Amount): DecimalParts {
  const raw = typeof amount === 'number' ? amount.toFixed(2) : String(amount).trim();
  const m = AMOUNT_PATTERN.exec(raw.replace(/,/g, ''));
  if (!m) throw new Error(`Not an amount: ${raw}`);
  const integer = m[2].replace(/^0+(?=\d)/, '');
  let fraction = (m[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2) fraction = fraction.substring(0, 2);
  const zero = /^0+$/.test(integer) && fraction === '00';
  return { negative: m[1] === '-' && !zero, integer, fraction };
}

function isZero(p: DecimalParts): boolean {
  return /^0+$/.test(p.integer) && p.fraction === '00';
}

function grouped(p: DecimalParts): string {
  let out = '';
  for (let i = 0; i < p.integer.length; i++) {
    if (i > 0 && (p.integer.length - i) % 3 === 0) out += ',';
    out += p.integer[i];
  }
  return p.fraction === '00' ? out : `${out}.${p.fraction}`;
}

/**
 * `KSh 2,200`; decimals only when non-zero (`KSh 2,200.50`). With `signed`,
 * positive values get `+ `; negative values always get `- `.
 * Throws for a non-numeric string.
 */
export function formatKes(amount: Amount, opts: { signed?: boolean } = {}): string {
  const p = parseAmount(amount);
  const body = `KSh ${grouped(p)}`;
  if (p.negative) return `- ${body}`;
  if (opts.signed && !isZero(p)) return `+ ${body}`;
  return body;
}

/** `formatKes`, or `—` when the amount is missing. */
export function formatKesOrDash(amount: Amount | null | undefined): string {
  return amount === null || amount === undefined ? MISSING_VALUE : formatKes(amount);
}

/** Grouped amount without the currency: `40,000`, `-40,000`. */
export function formatAmount(amount: Amount): string {
  const p = parseAmount(amount);
  return p.negative ? `-${grouped(p)}` : grouped(p);
}

/** Ledger amount: `+ KSh 1,750`, `− KSh 6,000` (U+2212), `KSh 0`. */
export function formatKesLedger(amount: Amount): string {
  const p = parseAmount(amount);
  const body = `KSh ${grouped(p)}`;
  if (isZero(p)) return body;
  return p.negative ? `− ${body}` : `+ ${body}`;
}

/** Spoken amount for `aria-label`: `1,750 shillings`, `minus 6,000 shillings`. */
export function kesSpoken(amount: Amount): string {
  const p = parseAmount(amount);
  const body = `${grouped(p)} shillings`;
  return p.negative ? `minus ${body}` : body;
}

// ---------------------------------------------------------------------------
// Money arithmetic (#8 A§4, owner WQ-27): decimal strings in cents, never
// floating point. Ports of the app's addDecimals / subtractDecimals /
// isPositiveAmount (`util/display.dart`). Results are 2-decimal strings
// (`"42200.00"`); a non-numeric string throws (as `parseAmount`).
// ---------------------------------------------------------------------------

function toCents(amount: Amount): bigint {
  const p = parseAmount(amount);
  const cents = BigInt(`${p.integer}${p.fraction}`);
  return p.negative ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** `a + b`: `addKes('2200.00', '40000.00')` → `'42200.00'`. */
export function addKes(a: Amount, b: Amount): string {
  return fromCents(toCents(a) + toCents(b));
}

/** `a − b`: `subtractKes('45000', '40000.00')` → `'5000.00'`; may be negative. */
export function subtractKes(a: Amount, b: Amount): string {
  return fromCents(toCents(a) - toCents(b));
}

/** −1, 0 or 1 as `a` is less than, equal to or greater than `b`. */
export function compareKes(a: Amount, b: Amount): -1 | 0 | 1 {
  const d = toCents(a) - toCents(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/** True when the amount is above zero (`'0.00'` and negatives are not). */
export function isPositiveKes(amount: Amount): boolean {
  return toCents(amount) > 0n;
}

// ---------------------------------------------------------------------------
// Local (browser zone) times
// ---------------------------------------------------------------------------

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

interface WallClock {
  readonly year: number;
  readonly month: number; // 0-11
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number; // Monday = 1 … Sunday = 7
}

function localWall(d: Date): WallClock {
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    weekday: d.getDay() === 0 ? 7 : d.getDay(),
  };
}

/** EAT wall clock: shift by +3 h and read only the UTC fields. */
function eatWall(d: Date): WallClock {
  const s = new Date(d.getTime() + EAT_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    weekday: s.getUTCDay() === 0 ? 7 : s.getUTCDay(),
  };
}

function clock12(w: WallClock): string {
  const hour12 = w.hour % 12 === 0 ? 12 : w.hour % 12;
  return `${hour12}:${String(w.minute).padStart(2, '0')} ${w.hour < 12 ? 'AM' : 'PM'}`;
}

function clock24(w: WallClock): string {
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}

/** Calendar days from `a` to `b` (positive when `a` is earlier). */
function calendarDaysBetween(a: WallClock, b: WallClock): number {
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / DAY_MS);
}

function shortDate(t: WallClock, ref: WallClock): string {
  const base = `${t.day} ${MONTHS[t.month]}`;
  return t.year === ref.year ? base : `${base} ${t.year}`;
}

function dayTime(t: WallClock, ref: WallClock): string {
  const days = calendarDaysBetween(t, ref);
  const clock = clock12(t);
  if (days === 0) return `Today, ${clock}`;
  if (days === 1) return `Yesterday, ${clock}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[t.weekday - 1]}, ${clock}`;
  return `${shortDate(t, ref)}, ${clock}`;
}

function relativeShort(time: Date, now: Date, t: WallClock, ref: WallClock): string {
  const days = calendarDaysBetween(t, ref);
  if (days <= 0) {
    const diffMs = now.getTime() - time.getTime();
    const minutes = Math.trunc(diffMs / 60000);
    if (minutes < 60) return `${minutes < 1 ? 1 : minutes}m`;
    return `${Math.trunc(diffMs / 3600000)}h`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[t.weekday - 1];
  return shortDate(t, ref);
}

/** `10:03 AM` (browser local). */
export function formatClock(date: DateInput): string {
  return clock12(localWall(toDate(date)));
}

/** `Today, 10:03 AM`, `Yesterday, 4:12 PM`, `Mon, 10:03 AM`, `12 Feb, 10:03 AM`. */
export function formatDayTime(date: DateInput, now: Date = new Date()): string {
  return dayTime(localWall(toDate(date)), localWall(now));
}

/** `2m`, `1h` (same day), `Yesterday`, `Mon`, `12 Feb` (browser local). */
export function formatRelativeShort(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date);
  return relativeShort(d, now, localWall(d), localWall(now));
}

/** `12 Feb`, or `12 Feb 2025` outside `now`'s year. */
export function formatShortDate(date: DateInput, now: Date = new Date()): string {
  return shortDate(localWall(toDate(date)), localWall(now));
}

/** `Feb 2026`. */
export function formatMonthYear(date: DateInput): string {
  const w = localWall(toDate(date));
  return `${MONTHS[w.month]} ${w.year}`;
}

// ---------------------------------------------------------------------------
// Durations and counters
// ---------------------------------------------------------------------------

function wholeMinutesUp(seconds: number): number {
  return seconds <= 0 ? 1 : Math.ceil(Math.trunc(seconds) / 60);
}

/** `ETA 12 min`: rounded up, minimum 1. */
export function formatEta(seconds: number): string {
  return `ETA ${wholeMinutesUp(seconds)} min`;
}

/** Countdown `m:ss`: `0:42`, `1:00`; negative → `0:00`. */
export function formatCountdown(seconds: number): string {
  const total = seconds < 0 ? 0 : Math.trunc(seconds);
  return `${Math.trunc(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Progress counter `3/5`. */
export function formatCounter(done: number, total: number): string {
  return `${done}/${total}`;
}

/** One decimal: `"4.90"` → `4.9`, `5` → `5.0`. */
export function formatRating(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isNaN(n)) throw new Error(`Not a rating: ${value}`);
  return n.toFixed(1);
}

// ---------------------------------------------------------------------------
// East Africa Time (independent of the browser zone)
// ---------------------------------------------------------------------------

/** `10:28 AM` in EAT. */
export function formatClockEat(date: DateInput): string {
  return clock12(eatWall(toDate(date)));
}

/** As `formatDayTime`, on EAT calendar days. */
export function formatDayTimeEat(date: DateInput, now: Date = new Date()): string {
  return dayTime(eatWall(toDate(date)), eatWall(now));
}

/**
 * Deadlines: `Today, 11:59 PM`, `Tomorrow, …`, `Yesterday, …`, else the date.
 * With `{ hour24: true }` (owner Q8-3, the checkout deadline line):
 * `Today, 23:59`.
 */
export function formatDeadlineEat(date: DateInput, now: Date = new Date(), opts: { hour24?: boolean } = {}): string {
  const t = eatWall(toDate(date));
  const ref = eatWall(now);
  const ahead = -calendarDaysBetween(t, ref);
  const clock = opts.hour24 ? clock24(t) : clock12(t);
  if (ahead === 0) return `Today, ${clock}`;
  if (ahead === 1) return `Tomorrow, ${clock}`;
  if (ahead === -1) return `Yesterday, ${clock}`;
  const day = `${t.day} ${MONTHS[t.month]}`;
  return t.year === ref.year ? `${day}, ${clock}` : `${day} ${t.year}, ${clock}`;
}

/** As `formatRelativeShort`, on EAT calendar days. */
export function formatRelativeShortEat(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date);
  return relativeShort(d, now, eatWall(d), eatWall(now));
}

/** EAT calendar day `YYYY-MM-DD`. */
export function eatDayKey(date: DateInput): string {
  const w = eatWall(toDate(date));
  return `${String(w.year).padStart(4, '0')}-${String(w.month + 1).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** EAT weekday: Monday = 1 … Sunday = 7. */
export function eatWeekday(date: DateInput): number {
  return eatWall(toDate(date)).weekday;
}

/** Monday 00:00 EAT of the week holding `date`, as an instant (Sunday 21:00 UTC). */
export function eatWeekStart(date: DateInput): Date {
  const w = eatWall(toDate(date));
  return new Date(Date.UTC(w.year, w.month, w.day - (w.weekday - 1)) - EAT_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// Distance, duration, phone
// ---------------------------------------------------------------------------

/** `1.2 km`, or metres under 1 km rounded to 10 m (`850 m`); negative → `0 m`. */
export function formatDistanceKm(km: number): string {
  const meters = km <= 0 ? 0 : km * 1000;
  if (meters < 995) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Whole minutes rounded up (minimum 1): `6 min`, `1 h 10 min`, `2 h`. */
export function formatDurationMin(seconds: number): string {
  const minutes = wholeMinutesUp(seconds);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.trunc(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Port of `display.dart formatHours` (#7, §W9a): whole hours → `1 hour` /
 * `24 hours`; otherwise `formatDurationMin` (`1 h 30 min`).
 */
export function formatHours(seconds: number): string {
  const minutes = Math.trunc(Math.trunc(seconds) / 60);
  if (minutes > 0 && minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  return formatDurationMin(seconds);
}

/**
 * Up to two upper-case initials from the first two words of `name`
 * (`InitialsAvatar.initialsFor`): `Achieng Wanjiru` → `AW`; blank → ``.
 */
export function initialsFor(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => (Array.from(w)[0] ?? '').toUpperCase())
    .join('');
}

const KENYAN_PHONE = /^(?:\+?254|0)([17]\d{8})$/;

/**
 * Port of `KenyanPhone.normalize` (auth-foundation §7.1): spaces and
 * hyphens stripped, then `+254` / `254` / `0` + `7XXXXXXXX` / `1XXXXXXXX`.
 * Returns `+2547…` / `+2541…`, or `null` when it is not a Kenyan mobile.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const m = KENYAN_PHONE.exec(input.trim().replace(/[\s-]/g, ''));
  return m ? `+254${m[1]}` : null;
}

/** `+254 712 345 678`; an unparseable number is returned unchanged. */
export function formatPhoneIntl(phone: string): string {
  const m = KENYAN_PHONE.exec(phone.trim());
  if (!m) return phone;
  const n = m[1];
  return `+254 ${n.substring(0, 3)} ${n.substring(3, 6)} ${n.substring(6)}`;
}
