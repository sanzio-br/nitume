import { taskActions } from './task-drawer';

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
