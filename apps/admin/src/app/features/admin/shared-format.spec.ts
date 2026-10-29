import {
  eatDayKey,
  eatLocalInputToIso,
  eatWeekday,
  formatDateTime,
  formatDateTimeEat,
  formatTime,
  formatKsh,
  formatKshExact,
  historyActor,
  parseKsh,
  toEatLocalInput,
} from './shared-format';
import { timeZoneSwitch } from '../../testing/admin-test-utils';

describe('formatKsh (row 82)', () => {
  it('rounds to whole shillings with the KSh prefix', () => {
    expect(formatKsh('25000.00')).toBe('KSh 25,000');
    expect(formatKsh(1450.6)).toBe('KSh 1,451');
  });

  it('shows a dash for empty values', () => {
    expect(formatKsh(undefined)).toBe('—');
    expect(formatKsh('')).toBe('—');
  });
});

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

  it('adds the year outside the current EAT year (§3.1)', () => {
    expect(formatDateTime('2025-10-12T13:30:00Z', now)).toBe('Sun 12 Oct 2025, 4:30 PM');
    // 31 Dec 2025 22:30 UTC is already 1 Jan 2026 in EAT: no year.
    expect(formatDateTime('2025-12-31T22:30:00Z', now)).toBe('Thu 1 Jan, 1:30 AM');
  });

  it('suffixes EAT for dialogs', () => {
    expect(formatDateTimeEat('2026-10-08T13:30:00Z', now)).toBe('Today, 4:30 PM EAT');
    expect(formatDateTimeEat(null, now)).toBe('—');
  });
});

describe('EAT regardless of the browser zone (row 96)', () => {
  // A zone far from Nairobi: local getters would be 10 hours off.
  const zone = timeZoneSwitch('America/Los_Angeles');
  beforeAll(zone.pin);
  afterAll(zone.restore);

  it('formats times in 12-hour EAT', () => {
    const at = new Date('2026-10-08T13:30:00Z');
    expect(at.getHours()).not.toBe(16);
    expect(formatTime(at)).toBe('4:30 PM');
    expect(formatTime(null)).toBe('—');
    expect(formatDateTime(at, new Date('2026-10-08T20:00:00Z'))).toBe('Today, 4:30 PM');
  });

  it('buckets days by the EAT calendar', () => {
    // 22:30 UTC on Sunday 11 Oct is 01:30 EAT on Monday 12 Oct.
    expect(eatDayKey('2026-10-11T22:30:00Z')).toBe('2026-10-12');
    expect(eatWeekday('2026-10-11T22:30:00Z')).toBe(1);
  });
});

describe('datetime-local helpers', () => {
  it('shows EAT and sends canonical UTC (row 96)', () => {
    const d = new Date('2026-10-08T09:00:00Z');
    const local = toEatLocalInput(d);
    expect(local).toBe('2026-10-08T12:00');
    const iso = eatLocalInputToIso(local);
    expect(iso).toBe('2026-10-08T09:00:00.000Z');
    expect(new Date(iso!).getTime()).toBe(d.getTime());
  });

  it('rejects malformed values', () => {
    expect(eatLocalInputToIso('')).toBeNull();
    expect(eatLocalInputToIso('2026-10-08')).toBeNull();
  });
});

describe('historyActor (task and account histories: drawer-task-offer row 187, drawer-user-status §3.1)', () => {
  const base = {
    id: 'h1',
    errandId: 'e1',
    fromStatus: 'RUNNER_ASSIGNED',
    toStatus: 'EXPIRED',
    createdAt: '2026-10-19T09:00:00Z',
  };

  it('names the admin when the API gives a display name', () => {
    expect(
      historyActor({
        ...base,
        actorType: 'admin',
        actor: { id: 'u1', displayName: 'Wanjiru K.' },
      }),
    ).toBe('Admin · Wanjiru K.');
  });

  it('falls back to the actor type as built', () => {
    expect(historyActor({ ...base, actorType: 'admin', actor: null })).toBe('Admin');
    expect(historyActor({ ...base, actorType: 'admin' })).toBe('Admin');
    expect(historyActor({ ...base, actorType: 'system', actor: null })).toBe('System');
  });

  it('names only admins', () => {
    expect(
      historyActor({ ...base, actorType: 'runner', actor: { id: 'u2', displayName: 'Kevin O.' } }),
    ).toBe('Runner');
  });
});

describe('historyActor on account status items (drawer-user-status §3.1)', () => {
  const item = {
    id: 'h1',
    fromStatus: 'active',
    toStatus: 'suspended',
    reason: 'Repeated no-shows on paid tasks',
    createdAt: '2026-10-28T09:00:00Z',
  };

  it('reads Admin · name, Admin, and System for a system or null actor', () => {
    expect(
      historyActor({ ...item, actorType: 'admin', actor: { id: 'a1', displayName: 'Wanjiru K.' } }),
    ).toBe('Admin · Wanjiru K.');
    expect(
      historyActor({ ...item, actorType: 'admin', actor: { id: 'a1', displayName: null } }),
    ).toBe('Admin');
    expect(historyActor({ ...item, actorType: 'system', actor: null })).toBe('System');
    expect(historyActor({ ...item, actorType: 'customer', actor: null })).toBe('Customer');
  });
});
