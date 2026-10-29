// Admin realtime events (issue #36, spec runner-web-presence §5, §8).
// Payloads of the three web runner presence events sent to the `admins`
// room (apps/api/src/realtime/realtime.events.ts), with defensive parsers:
// a malformed payload throws here and is dropped by the service.
import type { Observable } from 'rxjs';

export const ADMIN_REALTIME_PATH = '/socket.io';

export const AdminRealtimeEvents = {
  webPingsStopped: 'runner:web_pings_stopped',
  webPingsResumed: 'runner:web_pings_resumed',
  webAutoOffline: 'runner:web_auto_offline',
} as const;

export type AdminRealtimeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** `runner:web_pings_stopped`; `lastPingAt` null when the runner never pinged. */
export interface WebPingsStopped {
  readonly runnerProfileId: string;
  readonly lastPingAt: string | null;
  readonly at: string;
}

/** `runner:web_pings_resumed`. */
export interface WebPingsResumed {
  readonly runnerProfileId: string;
  readonly at: string;
}

/** `runner:web_auto_offline`. */
export interface WebAutoOffline {
  readonly runnerProfileId: string;
  readonly lastPingAt: string | null;
  readonly at: string;
}

/** What `AdminDataService.attachLive` reads from the realtime service. */
export interface AdminLiveSource {
  readonly stateChanges$: Observable<AdminRealtimeState>;
  readonly webPingsStopped$: Observable<WebPingsStopped>;
  readonly webPingsResumed$: Observable<WebPingsResumed>;
  readonly webAutoOffline$: Observable<WebAutoOffline>;
}

type Json = Record<string, unknown>;

function asObject(data: unknown): Json {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('payload is not an object');
  }
  return data as Json;
}

function id(json: Json): string {
  const v = json['runnerProfileId'];
  if (typeof v !== 'string' || v.trim() === '') throw new Error('runnerProfileId');
  return v;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function iso(json: Json, key: string): string {
  const v = json[key];
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v))) {
    throw new Error(key);
  }
  return v;
}

function isoOrNull(json: Json, key: string): string | null {
  return json[key] === null || json[key] === undefined ? null : iso(json, key);
}

export const AdminRealtimeParsers = {
  webPingsStopped(data: unknown): WebPingsStopped {
    const json = asObject(data);
    return {
      runnerProfileId: id(json),
      lastPingAt: isoOrNull(json, 'lastPingAt'),
      at: iso(json, 'at'),
    };
  },
  webPingsResumed(data: unknown): WebPingsResumed {
    const json = asObject(data);
    return { runnerProfileId: id(json), at: iso(json, 'at') };
  },
  webAutoOffline(data: unknown): WebAutoOffline {
    const json = asObject(data);
    return {
      runnerProfileId: id(json),
      lastPingAt: isoOrNull(json, 'lastPingAt'),
      at: iso(json, 'at'),
    };
  },
};
