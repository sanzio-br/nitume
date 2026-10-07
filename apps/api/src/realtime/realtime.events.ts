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
 */
export const errandRoom = (errandId: string): string => `errand:${errandId}`;

export const SocketClientEvent = {
  ERRAND_JOIN: 'errand:join',
  ERRAND_LEAVE: 'errand:leave',
} as const;

export const SocketServerEvent = {
  LOCATION_UPDATE: 'location:update',
  ERRAND_STATUS_CHANGED: 'errand:status_changed',
  EVIDENCE_UPLOADED: 'evidence:uploaded',
  PRICE_CHANGE_REQUESTED: 'price_change:requested',
} as const;

/** In-process domain events (EventEmitter2) the realtime module listens to. */
export const DomainEvent = {
  ERRAND_STATUS_CHANGED: 'errand.status_changed',
  EVIDENCE_UPLOADED: 'evidence.uploaded',
  PRICE_CHANGE_REQUESTED: 'price_change.requested',
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
