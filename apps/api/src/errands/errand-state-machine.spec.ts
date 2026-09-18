import { describe, expect, it } from 'vitest';
import { ErrandStatus, StatusHistoryActor } from '../common/enums';
import {
  ERRAND_TRANSITIONS,
  ErrandStateMachine,
} from './errand-state-machine';

const C = StatusHistoryActor.CUSTOMER;
const R = StatusHistoryActor.RUNNER;
const A = StatusHistoryActor.ADMIN;
const S = StatusHistoryActor.SYSTEM;

describe('ErrandStateMachine', () => {
  it('declares every ErrandStatus exactly once as a source state', () => {
    const sources = new Set(Object.keys(ERRAND_TRANSITIONS));
    const declared = Object.values(ErrandStatus);
    declared.forEach((status) => expect(sources.has(status)).toBe(true));
    expect(sources.size).toBe(declared.length);
  });

  it('accepts the full happy-path lifecycle', () => {
    const path: ErrandStatus[] = [
      ErrandStatus.DRAFT,
      ErrandStatus.REQUESTED,
      ErrandStatus.QUOTED,
      ErrandStatus.ACCEPTED,
      ErrandStatus.PAYMENT_CONFIRMED,
      ErrandStatus.RUNNER_ASSIGNED,
      ErrandStatus.RUNNER_EN_ROUTE,
      ErrandStatus.ARRIVED,
      ErrandStatus.IN_PROGRESS,
      ErrandStatus.AWAITING_CUSTOMER,
      ErrandStatus.COMPLETED,
      ErrandStatus.CONFIRMED,
      ErrandStatus.SETTLED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(
        ErrandStateMachine.canTransition(path[i], path[i + 1]),
        `${path[i]} -> ${path[i + 1]} should be legal`,
      ).toBe(true);
    }
    expect(ErrandStateMachine.isTerminal(ErrandStatus.SETTLED)).toBe(true);
  });

  it('rejects every reverse transition', () => {
    const all = Object.values(ErrandStatus);
    for (const from of all) {
      for (const to of all) {
        if (ErrandStateMachine.canTransition(from, to)) {
          expect(
            ErrandStateMachine.canTransition(to, from),
            `${to} -> ${from} must never be legal`,
          ).toBe(false);
        }
      }
    }
  });

  it('rejects all illegal single-step transitions (exhaustive)', () => {
    const all = Object.values(ErrandStatus);
    const declared = new Set(
      ErrandStateMachine.allTransitions().map((t) => `${t.from}|${t.to}`),
    );
    let legalCount = 0;
    for (const from of all) {
      for (const to of all) {
        const key = `${from}|${to}`;
        if (declared.has(key)) {
          legalCount += 1;
          expect(ErrandStateMachine.canTransition(from, to)).toBe(true);
        } else {
          expect(ErrandStateMachine.canTransition(from, to)).toBe(false);
        }
      }
    }
    expect(legalCount).toBeGreaterThan(0);
  });

  it('terminal states have no outgoing transitions', () => {
    const terminal = [
      ErrandStatus.SETTLED,
      ErrandStatus.CANCELLED,
      ErrandStatus.FAILED,
      ErrandStatus.DISPUTED,
      ErrandStatus.EXPIRED,
    ];
    for (const status of terminal) {
      expect(ERRAND_TRANSITIONS[status]).toHaveLength(0);
      expect(ErrandStateMachine.allTransitions().some((t) => t.from === status)).toBe(false);
    }
  });

  it('assigns the correct actors to each lifecycle step', () => {
    const expects: [ErrandStatus, ErrandStatus, StatusHistoryActor[]][] = [
      [ErrandStatus.DRAFT, ErrandStatus.REQUESTED, [C]],
      [ErrandStatus.DRAFT, ErrandStatus.CANCELLED, [C]],
      [ErrandStatus.REQUESTED, ErrandStatus.QUOTED, [A, S]],
      [ErrandStatus.REQUESTED, ErrandStatus.CANCELLED, [C]],
      [ErrandStatus.QUOTED, ErrandStatus.ACCEPTED, [C]],
      [ErrandStatus.QUOTED, ErrandStatus.CANCELLED, [C]],
      [ErrandStatus.ACCEPTED, ErrandStatus.PAYMENT_CONFIRMED, [A, S]],
      [ErrandStatus.ACCEPTED, ErrandStatus.CANCELLED, [C]],
      [ErrandStatus.PAYMENT_CONFIRMED, ErrandStatus.RUNNER_ASSIGNED, [A, S]],
      [ErrandStatus.RUNNER_ASSIGNED, ErrandStatus.RUNNER_EN_ROUTE, [R]],
      [ErrandStatus.RUNNER_ASSIGNED, ErrandStatus.CANCELLED, [A]],
      [ErrandStatus.RUNNER_ASSIGNED, ErrandStatus.EXPIRED, [S]],
      [ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.ARRIVED, [R, S]],
      [ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.FAILED, [R, S]],
      [ErrandStatus.ARRIVED, ErrandStatus.IN_PROGRESS, [R]],
      [ErrandStatus.IN_PROGRESS, ErrandStatus.AWAITING_CUSTOMER, [R]],
      [ErrandStatus.IN_PROGRESS, ErrandStatus.DISPUTED, [C]],
      [ErrandStatus.AWAITING_CUSTOMER, ErrandStatus.COMPLETED, [C]],
      [ErrandStatus.AWAITING_CUSTOMER, ErrandStatus.DISPUTED, [C]],
      [ErrandStatus.COMPLETED, ErrandStatus.CONFIRMED, [C]],
      [ErrandStatus.COMPLETED, ErrandStatus.DISPUTED, [C]],
      [ErrandStatus.CONFIRMED, ErrandStatus.SETTLED, [S]],
    ];
    for (const [from, to, actors] of expects) {
      const allowed = ErrandStateMachine.allowedActors(from, to);
      expect(allowed, `${from} -> ${to}`).toEqual(actors);
      for (const actor of actors) {
        expect(ErrandStateMachine.actorCanPerform(from, to, actor)).toBe(true);
      }
    }
  });

  it('denies actors who are not on the transition whitelist', () => {
    // A customer cannot cancel after a runner is assigned.
    expect(ErrandStateMachine.actorCanPerform(
      ErrandStatus.RUNNER_ASSIGNED,
      ErrandStatus.CANCELLED,
      C,
    )).toBe(false);
    // A runner cannot settle a confirmed errand fee.
    expect(ErrandStateMachine.actorCanPerform(
      ErrandStatus.CONFIRMED,
      ErrandStatus.SETTLED,
      R,
    )).toBe(false);
    // Only the owner can accept a quoted price.
    expect(ErrandStateMachine.actorCanPerform(
      ErrandStatus.QUOTED,
      ErrandStatus.ACCEPTED,
      R,
    )).toBe(false);
  });

  it('all driver states branch with disjoint actors', () => {
    // RUNNER_EN_ROUTE -> ARRIVED vs FAILED: identical actor sets.
    expect(ErrandStateMachine.allowedActors(ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.ARRIVED))
      .toEqual([R, S]);
    expect(ErrandStateMachine.allowedActors(ErrandStatus.RUNNER_EN_ROUTE, ErrandStatus.FAILED))
      .toEqual([R, S]);
  });
});