import { historyActor, taskActions } from './task-drawer';

describe('task drawer admin actions (G-16, §3.3)', () => {
  it('offers Assign runner only at PAYMENT_CONFIRMED', () => {
    expect(taskActions('PAYMENT_CONFIRMED').assign).toBe(true);
    for (const s of ['REQUESTED', 'QUOTED', 'ACCEPTED', 'RUNNER_ASSIGNED', 'DISPUTED']) {
      expect(taskActions(s).assign).toBe(false);
    }
  });

  it('offers the first Issue quote only at REQUESTED', () => {
    expect(taskActions('REQUESTED').quote).toBe(true);
    expect(taskActions('QUOTED').quote).toBe(false);
  });
});

describe('status history actor (drawer-task-offer, row 187)', () => {
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
