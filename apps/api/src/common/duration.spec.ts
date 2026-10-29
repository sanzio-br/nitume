import { describe, expect, it } from 'vitest';
import { durationSeconds } from './duration';

describe('durationSeconds', () => {
  it.each([
    ['15m', 900],
    ['900s', 900],
    ['1h', 3600],
    ['2 days', 172_800],
    ['30d', 2_592_000],
    ['1.5h', 5400],
    ['1500', 2], // jsonwebtoken: a unitless string is milliseconds; rounded up
    [900, 900],
  ])('%s -> %i seconds', (value, seconds) => {
    expect(durationSeconds(value, 1)).toBe(seconds);
  });

  it.each(['', 'soon', '15 fortnights', '-5m', undefined, null, Number.NaN])('falls back for %s', (value) => {
    expect(durationSeconds(value as never, 42)).toBe(42);
  });
});
