import { liveMapSubLine } from './live-map.panel';
import { lastNDates, lastNWeeks } from '../admin-data.service';
import { timeZoneSwitch } from '../../../testing/admin-test-utils';

describe('live map times (row 96)', () => {
  // Pin a non-EAT browser zone: the sync time must still read EAT.
  const zone = timeZoneSwitch('Europe/London');
  beforeAll(zone.pin);
  afterAll(zone.restore);

  it('shows the sync time in 12-hour East Africa Time', () => {
    // 13:30 UTC = 14:30 in London (BST), 4:30 PM in Nairobi.
    const at = Date.parse('2026-10-08T13:30:00Z');
    expect(new Date(at).getHours()).toBe(14);
    expect(liveMapSubLine(at)).toBe('Nairobi · synced 4:30 PM');
  });

  it('buckets the daily bars by EAT day', () => {
    // 22:30 UTC Sunday 11 Oct = Monday 12 Oct in Nairobi.
    const days = lastNDates(2, Date.parse('2026-10-11T22:30:00Z'));
    expect(days).toEqual([
      { key: '2026-10-11', label: 'S' },
      { key: '2026-10-12', label: 'M' },
    ]);
  });

  it('starts weeks on Monday 00:00 EAT', () => {
    const [week] = lastNWeeks(1, Date.parse('2026-10-14T10:00:00Z'));
    expect(week.start.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-10-18T21:00:00.000Z');
  });
});
