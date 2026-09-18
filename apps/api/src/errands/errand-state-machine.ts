import { ErrandStatus, StatusHistoryActor } from '../common/enums';

/**
 * Strict errand lifecycle state machine.
 *
 * Reproduces the §3.3 lifecycle diagram 1:1. Every transition lists which
 * actors are allowed to trigger it. Statuses with no transitions are terminal
 * (CANCELLED, FAILED, DISPUTED, EXPIRED, SETTLED).
 */
export interface ErrandTransition {
  to: ErrandStatus;
  allowedActors: StatusHistoryActor[];
}

const C = StatusHistoryActor.CUSTOMER;
const R = StatusHistoryActor.RUNNER;
const A = StatusHistoryActor.ADMIN;
const S = StatusHistoryActor.SYSTEM;

export const ERRAND_TRANSITIONS: Record<ErrandStatus, ErrandTransition[]> = {
  [ErrandStatus.DRAFT]: [
    { to: ErrandStatus.REQUESTED, allowedActors: [C] },
    { to: ErrandStatus.CANCELLED, allowedActors: [C] },
  ],
  [ErrandStatus.REQUESTED]: [
    { to: ErrandStatus.QUOTED, allowedActors: [A, S] },
    { to: ErrandStatus.CANCELLED, allowedActors: [C] },
  ],
  [ErrandStatus.QUOTED]: [
    { to: ErrandStatus.ACCEPTED, allowedActors: [C] },
    { to: ErrandStatus.CANCELLED, allowedActors: [C] },
  ],
  [ErrandStatus.ACCEPTED]: [
    { to: ErrandStatus.PAYMENT_CONFIRMED, allowedActors: [A, S] },
    { to: ErrandStatus.CANCELLED, allowedActors: [C] },
  ],
  [ErrandStatus.PAYMENT_CONFIRMED]: [
    { to: ErrandStatus.RUNNER_ASSIGNED, allowedActors: [A, S] },
  ],
  [ErrandStatus.RUNNER_ASSIGNED]: [
    { to: ErrandStatus.RUNNER_EN_ROUTE, allowedActors: [R] },
    { to: ErrandStatus.CANCELLED, allowedActors: [A] },
    { to: ErrandStatus.EXPIRED, allowedActors: [S] },
  ],
  [ErrandStatus.RUNNER_EN_ROUTE]: [
    { to: ErrandStatus.ARRIVED, allowedActors: [R, S] },
    { to: ErrandStatus.FAILED, allowedActors: [R, S] },
  ],
  [ErrandStatus.ARRIVED]: [
    { to: ErrandStatus.IN_PROGRESS, allowedActors: [R] },
  ],
  [ErrandStatus.IN_PROGRESS]: [
    { to: ErrandStatus.AWAITING_CUSTOMER, allowedActors: [R] },
    { to: ErrandStatus.DISPUTED, allowedActors: [C] },
  ],
  [ErrandStatus.AWAITING_CUSTOMER]: [
    { to: ErrandStatus.COMPLETED, allowedActors: [C] },
    { to: ErrandStatus.DISPUTED, allowedActors: [C] },
  ],
  [ErrandStatus.COMPLETED]: [
    { to: ErrandStatus.CONFIRMED, allowedActors: [C] },
    { to: ErrandStatus.DISPUTED, allowedActors: [C] },
  ],
  [ErrandStatus.CONFIRMED]: [
    { to: ErrandStatus.SETTLED, allowedActors: [S] },
  ],
  // Terminal states — no outgoing transitions (§3.3).
  [ErrandStatus.SETTLED]: [],
  [ErrandStatus.CANCELLED]: [],
  [ErrandStatus.FAILED]: [],
  [ErrandStatus.DISPUTED]: [],
  [ErrandStatus.EXPIRED]: [],
};

export class ErrandStateMachine {
  static canTransition(from: ErrandStatus, to: ErrandStatus): boolean {
    return ERRAND_TRANSITIONS[from]?.some((t) => t.to === to) ?? false;
  }

  static allowedActors(from: ErrandStatus, to: ErrandStatus): StatusHistoryActor[] {
    return ERRAND_TRANSITIONS[from]?.find((t) => t.to === to)?.allowedActors ?? [];
  }

  static actorCanPerform(
    from: ErrandStatus,
    to: ErrandStatus,
    actor: StatusHistoryActor,
  ): boolean {
    return this.allowedActors(from, to).includes(actor);
  }

  static targetActors(to: ErrandStatus): ErrandTransition[] {
    return Object.values(ERRAND_TRANSITIONS)
      .flat()
      .filter((t) => t.to === to);
  }

  static isTerminal(status: ErrandStatus): boolean {
    return ERRAND_TRANSITIONS[status]?.length === 0;
  }

  /** All valid one-step transitions, for enumerating the lifecycle. */
  static allTransitions(): { from: ErrandStatus; to: ErrandStatus; actors: StatusHistoryActor[] }[] {
    return (Object.keys(ERRAND_TRANSITIONS) as ErrandStatus[]).flatMap((from) =>
      ERRAND_TRANSITIONS[from].map((t) => ({
        from,
        to: t.to,
        actors: t.allowedActors,
      })),
    );
  }
}