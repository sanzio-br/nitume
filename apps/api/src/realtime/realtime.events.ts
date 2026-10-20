/**
 * Socket.IO contract (§4.1, §4.2, §4.4). Every name lives here so that a
 * rename decided by the owner is a one-line change.
 *
 * Named by Nitume_System_Design.md:
 *  - room `errand:{errandId}` (§4.2)
 *  - server -> client `location:update` { lat, lng, eta } (§4.2)
 *
 * PROPOSED (not named in the system design; pending owner confirmation):
 *  - client -> server `errand:join` / `errand:leave` { errandId }
 *  - server -> client `errand:status_changed` (mirrors the §3.3 domain event
 *    `errand.status_changed`)
 *  - server -> client `evidence:uploaded`
 *  - server -> client `price_change:requested`
 *  - server -> client `quote:reissued` (admin re-quote, N-4 / row 72)
 *  - server -> client `merchant_details:updated` (Till/Paybill set)
 *  - room `admins` + server -> client `quote:requested` (row 68)
 *  - server -> client `merchant_details:changed` (row 80)
 *
 * Runner room and events (RA-4, RA-5; `docs/specs/runner/_shared.md` §10):
 *  - room `runner:{runnerProfileId}:status` (§4.2), joined by the server on
 *    connect from the authenticated runner, never from a client id (row 139)
 *  - server -> client `job:offered`, `job:offer_withdrawn`,
 *    `price_change:decided` (names from the runner spec, RA-5)
 *  - client -> server `location:ping` (§4.2) with an ack (`LocationPingAck`)
 */
export const errandRoom = (errandId: string): string => `errand:${errandId}`;

/** §4.2 `runner:{runnerId}:status`: one runner's own sockets (job offers). */
export const runnerRoom = (runnerProfileId: string): string => `runner:${runnerProfileId}:status`;

/**
 * PROPOSED: every authenticated admin socket joins this room on connect
 * (admin-wide pushes such as `quote:requested`, row 68).
 */
export const ADMIN_ROOM = 'admins';

export const SocketClientEvent = {
  ERRAND_JOIN: 'errand:join',
  ERRAND_LEAVE: 'errand:leave',
  /** §4.2, RA-4: runner position `{ lat, lng, errandId?, accuracy?, ts? }`. */
  LOCATION_PING: 'location:ping',
} as const;

export const SocketServerEvent = {
  LOCATION_UPDATE: 'location:update',
  ERRAND_STATUS_CHANGED: 'errand:status_changed',
  EVIDENCE_UPLOADED: 'evidence:uploaded',
  PRICE_CHANGE_REQUESTED: 'price_change:requested',
  QUOTE_REISSUED: 'quote:reissued',
  MERCHANT_DETAILS_UPDATED: 'merchant_details:updated',
  /** PROPOSED (row 80): details changed after a merchant-direct payment started. */
  MERCHANT_DETAILS_CHANGED: 'merchant_details:changed',
  /**
   * PROPOSED: sent to a socket just before it is removed from `errand:{id}`
   * because the user lost access (e.g. runner reassigned). `{ errandId }`.
   */
  ERRAND_ACCESS_REVOKED: 'errand:access_revoked',
  /** PROPOSED (row 68): to `admins` and `errand:{id}`. */
  QUOTE_REQUESTED: 'quote:requested',
  /** RA-5: to `runner:{id}:status`, an offer was made (`JobOfferedPayload`). */
  JOB_OFFERED: 'job:offered',
  /** RA-5: to `runner:{id}:status`, an open offer ended (`JobOfferWithdrawnPayload`). */
  JOB_OFFER_WITHDRAWN: 'job:offer_withdrawn',
  /** RA-5: to the current runner's room and `errand:{id}` (`PriceChangeDecidedPayload`). */
  PRICE_CHANGE_DECIDED: 'price_change:decided',
  /**
   * Row 248: to the current runner's room and `errand:{id}`, a send_to_runner
   * difference was paid (`PriceDifferencePaidEvent`): the runner may now buy
   * at the new amount (refetch `GET /runners/me/jobs/:errandId`).
   */
  PRICE_CHANGE_DIFFERENCE_PAID: 'price_change:difference_paid',
} as const;

/** In-process domain events (EventEmitter2) the realtime module listens to. */
export const DomainEvent = {
  ERRAND_STATUS_CHANGED: 'errand.status_changed',
  EVIDENCE_UPLOADED: 'evidence.uploaded',
  PRICE_CHANGE_REQUESTED: 'price_change.requested',
  QUOTE_REISSUED: 'quote.reissued',
  MERCHANT_DETAILS_UPDATED: 'errand.merchant_details_updated',
  QUOTE_REQUESTED: 'quote.requested',
  MERCHANT_DETAILS_CHANGED: 'merchant_details.changed',
  /**
   * Emit `{ errandId }` whenever who may view an errand changes without a
   * status change; the gateway re-checks every socket in the room.
   */
  ERRAND_ACCESS_CHANGED: 'errand.access_changed',
  /** RA-5 (errands module, after commit). */
  OFFER_MADE: 'assignment.offer_made',
  OFFER_WITHDRAWN: 'assignment.offer_withdrawn',
  /** RA-5 (price-change module, after commit). */
  PRICE_CHANGE_DECIDED: 'price_change.decided',
  /** Row 248 (payments module, after the difference payment completed). */
  PRICE_CHANGE_DIFFERENCE_PAID: 'price_change.difference_paid',
} as const;

/** `job:offered`: fetch the job with `GET /runners/me/jobs/:errandId`. */
export interface JobOfferedPayload {
  errandId: string;
  assignmentId: string;
  /** ISO; null only on old offers (row 156: no countdown, never removed). */
  offerExpiresAt: string | null;
  offeredAt: string;
}

/** `job:offer_withdrawn`: drop the card; `reason` is never shown as copy. */
export interface JobOfferWithdrawnPayload {
  errandId: string;
  assignmentId: string;
  reason: 'expired' | 'declined' | 'cancelled';
  at: string;
}

/**
 * `price_change:decided` (and the in-process `price_change.decided`).
 * `outcome`: `approved` (new item amount `toPrice`), `rejected` (an admin
 * rejected it; the task continues at `fromPrice`, row 55) or `cancelled`
 * (the customer rejected it and the task is CANCELLED, row 37).
 */
export interface PriceChangeDecidedEvent {
  errandId: string;
  requestId: string;
  /** The request's status (A8). */
  status: 'approved' | 'rejected';
  outcome: 'approved' | 'rejected' | 'cancelled';
  fromPrice: string;
  toPrice: string;
  decidedAt: string;
}

export interface EvidenceUploadedEvent {
  errandId: string;
  evidenceId: string;
  type: string;
  capturedAt: string;
}

export interface PriceChangeRequestedEvent {
  errandId: string;
  requestId: string;
  fromPrice: string;
  toPrice: string;
  reason: string | null;
  createdAt: string;
}

export interface LocationUpdatePayload {
  errandId: string;
  lat: number;
  lng: number;
  /** Seconds to arrival, or null when unknown. */
  eta: number | null;
  /** Device-reported accuracy in metres, or null. */
  accuracy?: number | null;
  ts: string;
}

/**
 * Ack of `location:ping`. `error` codes: `unauthenticated`, `not_runner`,
 * `invalid_payload`, `rate_limited`, `stale_ping`, `runner_offline`,
 * `forbidden` (not this runner's accepted job: stop pinging it),
 * `not_live` (the job is not RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS: stop),
 * `unavailable` (server could not process; keep the cadence).
 */
export interface LocationPingAck {
  ok: boolean;
  error?: string;
  /** Job pings: the job's current status, so the app can stop at AWAITING_CUSTOMER. */
  status?: string;
}

export interface JoinAck {
  ok: boolean;
  room?: string;
  error?: string;
}
