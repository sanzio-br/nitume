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
 */
export const errandRoom = (errandId: string): string => `errand:${errandId}`;

/**
 * PROPOSED: every authenticated admin socket joins this room on connect
 * (admin-wide pushes such as `quote:requested`, row 68).
 */
export const ADMIN_ROOM = 'admins';

export const SocketClientEvent = {
  ERRAND_JOIN: 'errand:join',
  ERRAND_LEAVE: 'errand:leave',
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
  /** PROPOSED (row 68): to `admins` and `errand:{id}`. */
  QUOTE_REQUESTED: 'quote:requested',
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
} as const;

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
  ts: string;
}

export interface JoinAck {
  ok: boolean;
  room?: string;
  error?: string;
}
