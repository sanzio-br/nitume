/** Formatting helpers for ops surfaces. Values stay as the API returned them
 * (decimal strings) — only presentation changes. Fira Code renders them. */

export function formatKsh(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  return `KSh ${Math.round(num).toLocaleString('en-KE')}`;
}

/** East Africa Time: fixed UTC+3, no daylight saving. */
export const OPS_TIME_ZONE = 'Africa/Nairobi';
const EAT_OFFSET_MS = 3 * 3600 * 1000;

/**
 * Exact money for refunds and paid amounts (`_shared.md` §3): never rounds.
 * `KSh 1,250` for whole shillings, `KSh 1,250.50` with cents, `—` for null.
 */
export function formatKshExact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  const cents = Math.round(num * 100) % 100 !== 0;
  return `KSh ${num.toLocaleString('en-KE', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Parses a typed KSh amount: strips `,` and spaces, accepts digits with at
 * most one `.` and 2 decimals. Returns null for anything else (incl. empty).
 */
export function parseKsh(input: string | null | undefined): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  const cleaned = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  return Number(cleaned);
}

/** True when the trimmed input is blank (for "required" vs "invalid" copy). */
export function isBlank(input: string | null | undefined): boolean {
  return input === null || input === undefined || input.trim() === '';
}

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: OPS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: OPS_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/**
 * Absolute date/time in East Africa Time (A-13): `Today, 4:30 PM`,
 * `Yesterday, 4:30 PM`, `Mon 12 Oct, 4:30 PM`. `—` for null.
 */
export function formatDateTime(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) {
    return '—';
  }
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const time = TIME.format(date);
  const day = DAY_KEY.format(date);
  if (day === DAY_KEY.format(now)) {
    return `Today, ${time}`;
  }
  if (day === DAY_KEY.format(new Date(now.getTime() - 24 * 3600 * 1000))) {
    return `Yesterday, ${time}`;
  }
  const parts = DATE_PARTS.formatToParts(date);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}, ${time}`;
}

/** `YYYY-MM-DDTHH:mm` in East Africa Time, for a `datetime-local` input. */
export function toEatLocalInput(date: Date): string {
  return new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * A `datetime-local` value read as East Africa Time → ISO 8601 with the
 * explicit `+03:00` offset. Null when the value is not a valid date/time.
 */
export function eatLocalInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const iso = `${value}:00+03:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}
