import {
  eatLocalInputToIso,
  formatDateTime,
  formatKshExact,
  parseKsh,
  toEatLocalInput,
} from './shared-format';

describe('formatKshExact (A-13)', () => {
  it('formats whole shillings without decimals', () => {
    expect(formatKshExact('1250.00')).toBe('KSh 1,250');
    expect(formatKshExact(0)).toBe('KSh 0');
  });

  it('keeps cents exactly, never rounds', () => {
    expect(formatKshExact('1250.50')).toBe('KSh 1,250.50');
    expect(formatKshExact(1199.99)).toBe('KSh 1,199.99');
  });

  it('shows a dash for empty values', () => {
    expect(formatKshExact(null)).toBe('—');
    expect(formatKshExact(undefined)).toBe('—');
    expect(formatKshExact('')).toBe('—');
  });
});

describe('parseKsh', () => {
  it('strips commas and spaces', () => {
    expect(parseKsh('1,250')).toBe(1250);
    expect(parseKsh(' 1 250.5 ')).toBe(1250.5);
  });

  it('accepts at most 2 decimals', () => {
    expect(parseKsh('10.25')).toBe(10.25);
    expect(parseKsh('10.255')).toBeNull();
  });

  it('rejects empty, negative and non-numeric input', () => {
    expect(parseKsh('')).toBeNull();
    expect(parseKsh('-5')).toBeNull();
    expect(parseKsh('12a')).toBeNull();
    expect(parseKsh('1.2.3')).toBeNull();
  });
});

describe('formatDateTime (East Africa Time)', () => {
  // 2026-10-08 12:00 EAT
  const now = new Date('2026-10-08T09:00:00Z');

  it('uses Today for the same EAT day', () => {
    expect(formatDateTime('2026-10-08T13:30:00Z', now)).toBe('Today, 4:30 PM');
  });

  it('uses the EAT day boundary, not UTC', () => {
    // 22:30 UTC on the 7th is 01:30 EAT on the 8th: today.
    expect(formatDateTime('2026-10-07T22:30:00Z', now)).toBe('Today, 1:30 AM');
  });

  it('uses Yesterday for the previous EAT day', () => {
    expect(formatDateTime('2026-10-07T13:30:00Z', now)).toBe('Yesterday, 4:30 PM');
  });

  it('uses weekday, day and month otherwise', () => {
    expect(formatDateTime('2026-10-05T06:05:00Z', now)).toBe('Mon 5 Oct, 9:05 AM');
  });

  it('shows a dash for null', () => {
    expect(formatDateTime(null, now)).toBe('—');
  });
});

describe('datetime-local helpers', () => {
  it('round-trips through EAT with an explicit offset', () => {
    const d = new Date('2026-10-08T09:00:00Z');
    const local = toEatLocalInput(d);
    expect(local).toBe('2026-10-08T12:00');
    const iso = eatLocalInputToIso(local);
    expect(iso).toBe('2026-10-08T12:00:00+03:00');
    expect(new Date(iso!).getTime()).toBe(d.getTime());
  });

  it('rejects malformed values', () => {
    expect(eatLocalInputToIso('')).toBeNull();
    expect(eatLocalInputToIso('2026-10-08')).toBeNull();
  });
});
