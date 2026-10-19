import { ErrandStatus, StatusHistoryActor } from '../common/enums';

/**
 * Strict errand lifecycle state machine.
 *
 * Based on the §3.3 lifecycle diagram plus the owner decisions of
 * 2026-10-07 (BOARD rows 8-10, 35-37). Every transition lists which actors
 * may trigger it; statuses with no transitions are terminal (CANCELLED,
 * FAILED, EXPIRED, SETTLED).
 *
 * - Customer "Confirm completion" is AWAITING_CUSTOMER -> COMPLETED.
 * - COMPLETED -> CONFIRMED -> SETTLED are system-only payout states, moved
 *   after the dispute window; customers never trigger them.
 * - DISPUTED is suspensive: only an admin resolves it, runner-favourable to
 *   COMPLETED or customer-favourable to CANCELLED, with a written rationale.
 * - IN_PROGRESS -> CANCELLED is the customer's "Reject & cancel task" on a
 *   pending price-change request, and nothing else (guarded).
 */
export enum TransitionGuard {
  /** Only via rejecting a pending price-change request (price-change module). */
  PRICE_CHANGE_REJECTION = 'price_change_rejection',
  /**
   * The admin expiries (rows 187, 201, 202, 203, 208, 225): only through
   * `POST /errands/:id/expire`, which checks the rule and the required reason.
   */
  ADMIN_EXPIRY = 'admin_expiry',
}

export interface ErrandTransition {
  to: ErrandStatus;
  allowedActors: StatusHistoryActor[];
  /** When set, the transition is only legal through that specific flow. */
  guard?: TransitionGuard;
  /** A guard that applies to one actor only (the other actors are unguarded). */
  actorGuards?: Partial<Record<StatusHistoryActor, TransitionGuard>>;
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
    // Rows 201, 225 (owner, 2026-10-19): admin "Expire task" on a paid task
    // never offered, only after its deadline; never the system.
    { to: ErrandStatus.EXPIRED, allowedActors: [A], guard: TransitionGuard.ADMIN_EXPIRY },
  ],
  [ErrandStatus.RUNNER_ASSIGNED]: [
    { to: ErrandStatus.RUNNER_EN_ROUTE, allowedActors: [R] },
    { to: ErrandStatus.CANCELLED, allowedActors: [A] },
    // S: the deadline sweep (row 185). A: the audited "Expire task — no
    // runner available" (rows 187, 202, 208), guarded.
    {
      to: ErrandStatus.EXPIRED,
      allowedActors: [S, A],
      actorGuards: { [A]: TransitionGuard.ADMIN_EXPIRY },
    },
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
    {
      to: ErrandStatus.CANCELLED,
      allowedActors: [C],
      guard: TransitionGuard.PRICE_CHANGE_REJECTION,
    },
  ],
  [ErrandStatus.AWAITING_CUSTOMER]: [
    { to: ErrandStatus.COMPLETED, allowedActors: [C] },
    { to: ErrandStatus.DISPUTED, allowedActors: [C] },
  ],
  [ErrandStatus.COMPLETED]: [
    // System-only, after the dispute window (errands.disputeWindowHours).
    { to: ErrandStatus.CONFIRMED, allowedActors: [S] },
    { to: ErrandStatus.DISPUTED, allowedActors: [C] },
  ],
  [ErrandStatus.CONFIRMED]: [
    { to: ErrandStatus.SETTLED, allowedActors: [S] },
  ],
  // Terminal states — no outgoing transitions (§3.3).
  [ErrandStatus.SETTLED]: [],
  [ErrandStatus.CANCELLED]: [],
  [ErrandStatus.FAILED]: [],
  // Dispute resolution (never a dead end). An ADMIN mediates and records a
  // written rationale. Runner-favourable: back to COMPLETED, so the runner's
  // earnings follow the normal payout process. Customer-favourable: CANCELLED,
  // which opens an admin refund review when the customer had paid.
  [ErrandStatus.DISPUTED]: [
    { to: ErrandStatus.COMPLETED, allowedActors: [A] },
    { to: ErrandStatus.CANCELLED, allowedActors: [A] },
  ],
  [ErrandStatus.EXPIRED]: [],
};

export class ErrandStateMachine {
  static canTransition(from: ErrandStatus, to: ErrandStatus): boolean {
    return ERRAND_TRANSITIONS[from]?.some((t) => t.to === to) ?? false;
  }

  static allowedActors(from: ErrandStatus, to: ErrandStatus): StatusHistoryActor[] {
    return ERRAND_TRANSITIONS[from]?.find((t) => t.to === to)?.allowedActors ?? [];
  }

  /**
   * Guard required for `from -> to` (for `actor`, when given), or null when
   * the transition is unguarded for them.
   */
  static guardFor(from: ErrandStatus, to: ErrandStatus, actor?: StatusHistoryActor): TransitionGuard | null {
    const t = ERRAND_TRANSITIONS[from]?.find((x) => x.to === to);
    return t?.guard ?? (actor ? t?.actorGuards?.[actor] : undefined) ?? null;
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
  static allTransitions(): {
    from: ErrandStatus;
    to: ErrandStatus;
    actors: StatusHistoryActor[];
    guard: TransitionGuard | null;
  }[] {
    return (Object.keys(ERRAND_TRANSITIONS) as ErrandStatus[]).flatMap((from) =>
      ERRAND_TRANSITIONS[from].map((t) => ({
        from,
        to: t.to,
        actors: t.allowedActors,
        guard: t.guard ?? null,
      })),
    );
  }
}