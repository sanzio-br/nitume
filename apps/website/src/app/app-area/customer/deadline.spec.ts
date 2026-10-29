// A.T13 (G8-9): `deadline.ts` holds the one `deadlineAt` (moved from the #7
// wizard store) and the new `deadlineChoiceOf`, both on EAT dates whatever
// the browser zone (owner WQ-2).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deadlineAt, deadlineChoiceOf } from './deadline';
import * as store from './new-task/task-draft.store';

const ZONES = ['Europe/London', 'Africa/Nairobi'];

function inZones(run: (zone: string) => void): void {
  const original = process.env['TZ'];
  try {
    for (const zone of ZONES) {
      process.env['TZ'] = zone;
      run(zone);
    }
  } finally {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  }
}

describe('app-area/customer/deadline.ts (A.T13, G8-9)', () => {
  it('A.T13 deadlineAt. Today/Tomorrow → 23:59 EAT of the EAT date as UTC ISO; Flexible → null; identical in London and Nairobi', () => {
    inZones((zone) => {
      const morning = new Date('2026-11-01T07:00:00.000Z'); // 10:00 EAT
      expect.soft(deadlineAt('today', morning), zone).toBe('2026-11-01T20:59:00.000Z');
      expect.soft(deadlineAt('tomorrow', morning), zone).toBe('2026-11-02T20:59:00.000Z');
      expect.soft(deadlineAt('flexible', morning), zone).toBeNull();
      // 21:30 London on 1 Nov = 00:30 EAT on 2 Nov: the EAT date decides.
      const londonEvening = new Date('2026-11-01T21:30:00.000Z');
      expect.soft(deadlineAt('today', londonEvening), zone).toBe('2026-11-02T20:59:00.000Z');
      expect.soft(deadlineAt('tomorrow', londonEvening), zone).toBe('2026-11-03T20:59:00.000Z');
    });
  });

  it('A.T13 deadlineChoiceOf. 23:59 EAT today → today, tomorrow → tomorrow, null → flexible, any other time → null; identical in both zones', () => {
    inZones((zone) => {
      const now = new Date('2026-11-01T07:00:00.000Z');
      expect.soft(deadlineChoiceOf('2026-11-01T20:59:00.000Z', now), zone).toBe('today');
      expect.soft(deadlineChoiceOf('2026-11-02T20:59:00.000Z', now), zone).toBe('tomorrow');
      expect.soft(deadlineChoiceOf(null, now), zone).toBe('flexible');
      expect.soft(deadlineChoiceOf('2026-11-01T18:00:00.000Z', now), zone).toBeNull();
      expect.soft(deadlineChoiceOf('2026-11-03T20:59:00.000Z', now), zone).toBeNull();
      expect.soft(deadlineChoiceOf('not a date', now), zone).toBeNull();
      // The same instant read at 00:30 EAT on 2 Nov is today's deadline.
      const londonEvening = new Date('2026-11-01T21:30:00.000Z');
      expect.soft(deadlineChoiceOf('2026-11-02T20:59:00.000Z', londonEvening), zone).toBe('today');
      expect.soft(deadlineChoiceOf('2026-11-01T20:59:00.000Z', londonEvening), zone).toBeNull();
    });
  });

  it('A.T13 move. the wizard store re-exports the same function (one copy); the store file declares none', () => {
    expect(store.deadlineAt).toBe(deadlineAt);
    const source = readFileSync(resolve(process.cwd(), 'src/app/app-area/customer/new-task/task-draft.store.ts'), 'utf8');
    expect(source).not.toMatch(/function deadlineAt/);
    expect(source).not.toMatch(/\+03:00/);
  });
});
