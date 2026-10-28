// Socket.IO event contract (ui-kit spec §6.4). The ONLY file that names an
// event or types a payload; views and the service use these constants.
// Mirrors apps/api/src/realtime/realtime.events.ts and the nitume_core
// `fromJson` factories: ISO dates are parsed to `Date`, prices stay strings,
// malformed payloads are rejected (the parser throws, the service drops).
import { ErrandStatus, parseErrandStatus } from '../../shared/status/status-presentation';

export const REALTIME_PATH = '/socket.io';

export const RealtimeEvents = {
  // client → server
  errandJoin: 'errand:join',
  errandLeave: 'errand:leave',
  locationPing: 'location:ping',
  // server → client
  locationUpdate: 'location:update',
  errandStatusChanged: 'errand:status_changed',
  evidenceUploaded: 'evidence:uploaded',
  priceChangeRequested: 'price_change:requested',
  quoteReissued: 'quote:reissued',
  merchantDetailsUpdated: 'merchant_details:updated',
  merchantDetailsChanged: 'merchant_details:changed',
  quoteRequested: 'quote:requested',
  errandAccessRevoked: 'errand:access_revoked',
  jobOffered: 'job:offered',
  jobOfferWithdrawn: 'job:offer_withdrawn',
  priceChangeDecided: 'price_change:decided',
  priceChangeDifferencePaid: 'price_change:difference_paid',
} as const;

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface LocationUpdate {
  readonly errandId: string;
  readonly lat: number;
  readonly lng: number;
  /** Seconds, or null when unknown. */
  readonly eta: number | null;
  readonly accuracy: number | null;
  readonly ts: Date | null;
}

export interface ErrandStatusChanged {
  readonly errandId: string;
  readonly status: ErrandStatus;
  readonly from: ErrandStatus | null;
  readonly at: Date | null;
}

export type EvidenceType = 'photo' | 'video' | 'receipt' | 'document' | 'signature';

export interface EvidenceUploaded {
  readonly errandId: string;
  readonly evidenceId: string;
  readonly type: EvidenceType;
  readonly capturedAt: Date | null;
}

export interface PriceChangeRequested {
  readonly errandId: string;
  readonly requestId: string;
  readonly fromPrice: string;
  readonly toPrice: string;
  readonly reason: string | null;
  readonly createdAt: Date | null;
}

export interface QuoteReissued {
  readonly errandId: string;
  readonly quoteId: string;
  readonly total: string;
  readonly currency: string;
  readonly expiresAt: Date | null;
  readonly status: ErrandStatus | null;
  readonly acceptanceRequired: boolean;
}

export interface MerchantDetailsUpdated {
  readonly errandId: string;
  readonly merchantName: string | null;
  readonly tillNumber: string | null;
  readonly paybillNumber: string | null;
  readonly accountReference: string | null;
}

export interface MerchantDetailsChanged extends MerchantDetailsUpdated {
  readonly merchantDetailsUpdatedAt: Date | null;
}

export interface QuoteRequested {
  readonly errandId: string;
  readonly reference: string | null;
  readonly quoteId: string | null;
  readonly status: ErrandStatus | null;
  readonly quoteRequestedAt: Date | null;
}

export interface ErrandAccessRevoked {
  readonly errandId: string;
}

export interface JobOffered {
  readonly errandId: string;
  readonly assignmentId: string;
  readonly offerExpiresAt: Date | null;
  readonly offeredAt: Date | null;
}

/** Never shown as copy. */
export type OfferWithdrawnReason = 'expired' | 'declined' | 'cancelled';

export interface JobOfferWithdrawn {
  readonly errandId: string;
  readonly assignmentId: string;
  readonly reason: OfferWithdrawnReason | null;
  readonly at: Date | null;
}

export interface PriceChangeDecided {
  readonly errandId: string;
  readonly requestId: string;
  readonly status: 'approved' | 'rejected' | null;
  readonly outcome: 'approved' | 'rejected' | 'cancelled' | null;
  readonly fromPrice: string;
  readonly toPrice: string;
  readonly decidedAt: Date | null;
}

export interface PriceDifferencePaid {
  readonly errandId: string;
  readonly requestId: string;
  readonly amount: string;
  readonly paidAt: Date | null;
}

export interface LocationPing {
  readonly lat: number;
  readonly lng: number;
  readonly errandId?: string;
  readonly accuracy?: number;
  readonly ts?: Date;
}

export type LocationPingError =
  | 'unauthenticated'
  | 'not_runner'
  | 'invalid_payload'
  | 'rate_limited'
  | 'stale_ping'
  | 'runner_offline'
  | 'forbidden'
  | 'not_live'
  | 'unavailable'
  | 'unknown';

export interface LocationPingAck {
  readonly ok: boolean;
  /** False when the ping never left (not connected, or no ack in 10 s). */
  readonly sent: boolean;
  readonly error: LocationPingError | null;
  readonly status: ErrandStatus | null;
  /** `forbidden` / `not_live`: stop job pings. */
  readonly stopJobPings: boolean;
}

export const PING_NOT_SENT: LocationPingAck = {
  ok: false,
  sent: false,
  error: null,
  status: null,
  stopJobPings: false,
};

// ---------------------------------------------------------------------------
// Parsers (throw on a malformed payload)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

class MalformedPayload extends Error {}

function asObject(data: unknown): Json {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MalformedPayload('not an object');
  }
  return data as Json;
}

function str(json: Json, key: string): string {
  const v = json[key];
  if (typeof v !== 'string') throw new MalformedPayload(`${key} missing`);
  return v;
}

function num(json: Json, key: string): number {
  const v = json[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new MalformedPayload(`${key} missing`);
  return v;
}

/** Decimal kept as a string (`"2200.00"`). */
function decimal(json: Json, key: string): string {
  const v = json[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  throw new MalformedPayload(`${key} missing`);
}

function optStr(json: Json, key: string): string | null {
  const v = json[key];
  return typeof v === 'string' ? v : null;
}

function nonBlank(json: Json, key: string): string | null {
  const v = json[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function optNum(json: Json, key: string): number | null {
  const v = json[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function date(json: Json, key: string): Date | null {
  const v = json[key];
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function status(json: Json, key: string): ErrandStatus {
  const s = parseErrandStatus(json[key]);
  if (s === null) throw new MalformedPayload(`unknown ${key}`);
  return s;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const EVIDENCE_TYPES: readonly EvidenceType[] = ['photo', 'video', 'receipt', 'document', 'signature'];
const PING_ERRORS: readonly LocationPingError[] = [
  'unauthenticated',
  'not_runner',
  'invalid_payload',
  'rate_limited',
  'stale_ping',
  'runner_offline',
  'forbidden',
  'not_live',
  'unavailable',
];

function merchantFields(json: Json): MerchantDetailsUpdated {
  return {
    errandId: str(json, 'errandId'),
    merchantName: nonBlank(json, 'merchantName'),
    tillNumber: nonBlank(json, 'tillNumber'),
    paybillNumber: nonBlank(json, 'paybillNumber'),
    accountReference: nonBlank(json, 'accountReference'),
  };
}

export const RealtimeParsers = {
  locationUpdate(data: unknown): LocationUpdate {
    const json = asObject(data);
    const eta = optNum(json, 'eta');
    return {
      errandId: str(json, 'errandId'),
      lat: num(json, 'lat'),
      lng: num(json, 'lng'),
      eta: eta === null ? null : Math.round(eta),
      accuracy: optNum(json, 'accuracy'),
      ts: date(json, 'ts'),
    };
  },

  errandStatusChanged(data: unknown): ErrandStatusChanged {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      // An unknown status drops the event (never coerced to a label).
      status: status(json, 'status'),
      from: json['from'] === null || json['from'] === undefined ? null : status(json, 'from'),
      at: date(json, 'at'),
    };
  },

  evidenceUploaded(data: unknown): EvidenceUploaded {
    const json = asObject(data);
    const type = oneOf(json['type'], EVIDENCE_TYPES);
    if (type === null) throw new MalformedPayload('unknown evidence type');
    return {
      errandId: str(json, 'errandId'),
      evidenceId: str(json, 'evidenceId'),
      type,
      capturedAt: date(json, 'capturedAt'),
    };
  },

  priceChangeRequested(data: unknown): PriceChangeRequested {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      requestId: str(json, 'requestId'),
      fromPrice: decimal(json, 'fromPrice'),
      toPrice: decimal(json, 'toPrice'),
      reason: optStr(json, 'reason'),
      createdAt: date(json, 'createdAt'),
    };
  },

  quoteReissued(data: unknown): QuoteReissued {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      quoteId: str(json, 'quoteId'),
      total: decimal(json, 'total'),
      currency: optStr(json, 'currency') ?? 'KES',
      expiresAt: date(json, 'expiresAt'),
      status: parseErrandStatus(json['status']),
      acceptanceRequired: json['acceptanceRequired'] === true,
    };
  },

  merchantDetailsUpdated(data: unknown): MerchantDetailsUpdated {
    return merchantFields(asObject(data));
  },

  merchantDetailsChanged(data: unknown): MerchantDetailsChanged {
    const json = asObject(data);
    return { ...merchantFields(json), merchantDetailsUpdatedAt: date(json, 'merchantDetailsUpdatedAt') };
  },

  quoteRequested(data: unknown): QuoteRequested {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      reference: optStr(json, 'reference'),
      quoteId: optStr(json, 'quoteId'),
      status: parseErrandStatus(json['status']),
      quoteRequestedAt: date(json, 'quoteRequestedAt'),
    };
  },

  errandAccessRevoked(data: unknown): ErrandAccessRevoked {
    return { errandId: str(asObject(data), 'errandId') };
  },

  jobOffered(data: unknown): JobOffered {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      assignmentId: str(json, 'assignmentId'),
      offerExpiresAt: date(json, 'offerExpiresAt'),
      offeredAt: date(json, 'offeredAt'),
    };
  },

  jobOfferWithdrawn(data: unknown): JobOfferWithdrawn {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      assignmentId: str(json, 'assignmentId'),
      reason: oneOf(json['reason'], ['expired', 'declined', 'cancelled'] as const),
      at: date(json, 'at'),
    };
  },

  priceChangeDecided(data: unknown): PriceChangeDecided {
    const json = asObject(data);
    return {
      errandId: str(json, 'errandId'),
      requestId: str(json, 'requestId'),
      status: oneOf(json['status'], ['approved', 'rejected'] as const),
      outcome: oneOf(json['outcome'], ['approved', 'rejected', 'cancelled'] as const),
      fromPrice: decimal(json, 'fromPrice'),
      toPrice: decimal(json, 'toPrice'),
      decidedAt: date(json, 'decidedAt'),
    };
  },

  priceDifferencePaid(data: unknown): PriceDifferencePaid {
    const json = asObject(data);
    const amount = json['amount'];
    return {
      errandId: str(json, 'errandId'),
      requestId: str(json, 'requestId'),
      // Flutter parseDecimalOrZero.
      amount: typeof amount === 'string' || typeof amount === 'number' ? String(amount) : '0',
      paidAt: date(json, 'paidAt'),
    };
  },

  locationPingAck(data: unknown): LocationPingAck {
    if (typeof data !== 'object' || data === null) return PING_NOT_SENT;
    const json = data as Json;
    const ok = json['ok'] === true;
    const error = ok ? null : (oneOf(json['error'], PING_ERRORS) ?? 'unknown');
    return {
      ok,
      sent: true,
      error,
      status: parseErrandStatus(json['status']),
      stopJobPings: error === 'forbidden' || error === 'not_live',
    };
  },
} as const;

/** Wire form of a ping (`ts` as ISO UTC). */
export function locationPingToJson(ping: LocationPing): Json {
  const out: Json = { lat: ping.lat, lng: ping.lng };
  if (ping.errandId !== undefined) out['errandId'] = ping.errandId;
  if (ping.accuracy !== undefined) out['accuracy'] = ping.accuracy;
  out['ts'] = (ping.ts ?? new Date()).toISOString();
  return out;
}

/** True for an `errand:join` ack of `{ ok: true }`. */
export function isJoinAckOk(ack: unknown): boolean {
  return typeof ack === 'object' && ack !== null && (ack as Json)['ok'] === true;
}
