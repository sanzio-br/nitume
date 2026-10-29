// NC§W9.4, NC§W9.5, NC§W9.6, NC§W9.9 and ND T17: TaskDraftStore (the
// memory-only scan of NC§W9.9 is in src/styles/customer-static.spec.ts).
import { DraftPlace, TaskDraftStore } from './task-draft.store';

const place = (name: string, placeId: string | null = `pid-${name}`): DraftPlace => ({
  addressText: name,
  lat: -1.28,
  lng: 36.82,
  placeId,
});

function store(): TaskDraftStore {
  return new TaskDraftStore();
}

describe('TaskDraftStore', () => {
  it('NC§W9.4 changeCategory. Flutter rules for places, items and budget; title and description kept; same category is a no-op', () => {
    const s = store();
    s.start('/app/customer/home', 'inspection');
    s.title.set('Check');
    s.description.set('Check the flat');
    const site = place('Nyali');
    s.first.set(site);
    s.changeCategory('representation');
    expect(s.first()).toBe(site); // inspection → representation keeps first

    s.changeCategory('pickup_delivery');
    expect(s.first()).toBeNull(); // one point → two points clears first
    const pickup = place('Sarit');
    s.first.set(pickup);
    s.dropoff.set(place('Home'));
    s.items.set([{ name: 'Milk', quantity: 2 }]);
    s.budget.set(500);
    s.changeCategory('buy_for_me');
    expect(s.first()).toBe(pickup); // pickup_delivery → buy_for_me keeps first
    expect(s.dropoff()).toBeNull(); // always clears dropoff
    expect(s.items()).toEqual([{ name: '', quantity: 1 }]); // items reset to one empty row
    expect(s.budget()).toBe(500); // kept buy ↔ get

    s.changeCategory('pickup_delivery');
    expect(s.budget()).toBe(500);
    s.changeCategory('inspection');
    expect(s.budget()).toBeNull(); // cleared get → inspection
    expect(s.title()).toBe('Check');
    expect(s.description()).toBe('Check the flat');

    s.first.set(site);
    s.items.set([{ name: 'x', quantity: 3 }]);
    s.changeCategory('inspection'); // no-op
    expect(s.first()).toBe(site);
    expect(s.items()).toEqual([{ name: 'x', quantity: 3 }]);
  });

  it('NC§W9.5 hasData. true for each single field; false for whitespace text, an unnamed item and budget 0', () => {
    const cases: [string, (s: TaskDraftStore) => void, boolean][] = [
      ['title', (s) => s.title.set('Hi'), true],
      ['description', (s) => s.description.set('Hello'), true],
      ['first', (s) => s.first.set(place('A')), true],
      ['dropoff', (s) => s.dropoff.set(place('B')), true],
      ['named item', (s) => s.items.set([{ name: 'Milk', quantity: 1 }]), true],
      ['budget > 0', (s) => s.budget.set(1), true],
      ['whitespace title', (s) => s.title.set('   '), false],
      ['whitespace description', (s) => s.description.set('\n '), false],
      ['unnamed item', (s) => s.items.set([{ name: ' ', quantity: 4 }]), false],
      ['budget 0', (s) => s.budget.set(0), false],
    ];
    for (const [name, apply, expected] of cases) {
      const s = store();
      s.start('/app/customer/home', 'buy_for_me');
      expect.soft(s.hasData(), 'empty').toBe(false);
      apply(s);
      expect.soft(s.hasData(), name).toBe(expected);
    }
  });

  it('NC§W9.6 locationRefused. true only while first/dropoff are the identical refused objects; any new pick makes it false', () => {
    const s = store();
    s.start('/app/customer/home', 'pickup_delivery');
    const a = place('A');
    const b = place('B');
    s.first.set(a);
    s.dropoff.set(b);
    expect(s.locationRefused()).toBe(false);
    s.outsideArea.set({ first: a, dropoff: b, pointType: 'dropoff' });
    expect(s.locationRefused()).toBe(true);
    s.dropoff.set({ ...b }); // an equal but new pick
    expect(s.locationRefused()).toBe(false);
    s.dropoff.set(b);
    expect(s.locationRefused()).toBe(true);
    s.first.set(place('C'));
    expect(s.locationRefused()).toBe(false);
  });

  it('NC§W9.9 finish. empties the draft and keeps submitted and openerUrl; a later start() clears both', () => {
    const s = store();
    s.start('/app/customer/history', 'inspection');
    s.title.set('Check');
    s.createdErrandId = 'e-1';
    s.detailsValidated = true;
    s.finish();
    expect(s.category()).toBeNull();
    expect(s.title()).toBe('');
    expect(s.createdErrandId).toBeNull();
    expect(s.detailsValidated).toBe(false);
    expect(s.submitted).toBe(true);
    expect(s.openerUrl).toBe('/app/customer/history');
    s.start('/app/customer/home', null);
    expect(s.submitted).toBe(false);
    expect(s.openerUrl).toBe('/app/customer/home');
    s.title.set('x');
    s.reset();
    expect(s.hasData()).toBe(false);
    expect(s.submitted).toBe(false);
  });

  describe('ND T17 toRequest (TZ stubbed)', () => {
    let tz: string | undefined;
    beforeEach(() => {
      tz = process.env['TZ'];
      process.env['TZ'] = 'Etc/GMT-3'; // UTC+3, the Kenyan offset
    });
    afterEach(() => {
      if (tz === undefined) delete process.env['TZ'];
      else process.env['TZ'] = tz;
    });

    // 2026-10-29 10:00 local (EAT +3).
    const now = () => new Date(2026, 9, 29, 10, 0);

    function inspection(): TaskDraftStore {
      const s = store();
      s.start('/app/customer/home', 'inspection');
      s.description.set('  Check the apartment  ');
      s.first.set(place('Nyali, Mombasa', 'p1'));
      return s;
    }

    it('ND T17 deadline. Today → local 23:59 as UTC ISO; Tomorrow → the next day; Flexible → no deadlineAt', () => {
      const s = inspection();
      expect(s.toRequest(now()).deadlineAt).toBe('2026-10-29T20:59:00.000Z');
      s.deadline.set('tomorrow');
      expect(s.toRequest(now()).deadlineAt).toBe('2026-10-30T20:59:00.000Z');
      s.deadline.set('flexible');
      expect('deadlineAt' in s.toRequest(now())).toBe(false);
      // The browser's zone, not EAT: a London browser (GMT on this date).
      process.env['TZ'] = 'Europe/London';
      s.deadline.set('today');
      expect(s.toRequest(new Date(2026, 9, 29, 10, 0)).deadlineAt).toBe('2026-10-29T23:59:00.000Z');
    });

    it('ND T17 inspection. one task_site with lon, budget 0, no items, no urgency, trimmed description, empty title omitted', () => {
      const body = inspection().toRequest(now());
      expect(body).toEqual({
        category: 'inspection',
        description: 'Check the apartment',
        budget: 0,
        deadlineAt: '2026-10-29T20:59:00.000Z',
        locations: [{ pointType: 'task_site', lat: -1.28, lon: 36.82, addressText: 'Nyali, Mombasa', placeId: 'p1' }],
      });
      expect(JSON.stringify(body)).not.toContain('urgency');
      expect(JSON.stringify(body)).not.toContain('"lng"');
    });

    it('ND T17 pickup_delivery. pickup + dropoff; budget 0 when empty; a saved address sends no placeId', () => {
      const s = store();
      s.start('/app/customer/home', 'pickup_delivery');
      s.description.set('Collect the parcel');
      s.first.set(place('Sarit', 'p-sarit'));
      s.dropoff.set(place('Home', null));
      const body = s.toRequest(now());
      expect(body.budget).toBe(0);
      expect(body.items).toBeUndefined();
      expect(body.locations).toEqual([
        { pointType: 'pickup', lat: -1.28, lon: 36.82, addressText: 'Sarit', placeId: 'p-sarit' },
        { pointType: 'dropoff', lat: -1.28, lon: 36.82, addressText: 'Home' },
      ]);
      s.budget.set(1500);
      expect(s.toRequest(now()).budget).toBe(1500);
    });

    it('ND T17 buy_for_me. sends trimmed named items only, the budget, and the trimmed title', () => {
      const s = store();
      s.start('/app/customer/home', 'buy_for_me');
      s.title.set('  Groceries ');
      s.description.set('Buy groceries');
      s.first.set(place('Naivas'));
      s.dropoff.set(place('Home'));
      s.budget.set(40000);
      s.items.set([
        { name: ' 2kg sugar ', quantity: 2 },
        { name: '  ', quantity: 5 },
        { name: 'Milk', quantity: 1 },
      ]);
      const body = s.toRequest(now());
      expect(body.title).toBe('Groceries');
      expect(body.budget).toBe(40000);
      expect(body.items).toEqual([
        { name: '2kg sugar', quantity: 2 },
        { name: 'Milk', quantity: 1 },
      ]);
    });
  });
});
