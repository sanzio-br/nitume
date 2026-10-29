const UNIT_SECONDS: Record<string, number> = {
  ms: 0.001,
  msec: 0.001,
  msecs: 0.001,
  millisecond: 0.001,
  milliseconds: 0.001,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
  w: 604_800,
  week: 604_800,
  weeks: 604_800,
  y: 31_557_600,
  yr: 31_557_600,
  yrs: 31_557_600,
  year: 31_557_600,
  years: 31_557_600,
};

/**
 * A JWT `expiresIn` value (e.g. `15m`, `900s`, `2 days`) in whole seconds,
 * rounded up. Follows `jsonwebtoken`: a number is seconds, a string without a
 * unit is milliseconds. `fallbackSeconds` for anything else.
 */
export const durationSeconds = (value: string | number | undefined | null, fallbackSeconds: number): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : fallbackSeconds;
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(value ?? '');
  if (!match) {
    return fallbackSeconds;
  }
  const unit = match[2].toLowerCase() || 'ms';
  const perUnit = UNIT_SECONDS[unit];
  return perUnit === undefined ? fallbackSeconds : Math.ceil(Number(match[1]) * perUnit);
};
