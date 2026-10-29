import { Subject } from 'rxjs';
import type {
  AdminLiveSource,
  AdminRealtimeState,
  WebAutoOffline,
  WebPingsResumed,
  WebPingsStopped,
} from '../core/realtime/admin-realtime.events';

/**
 * Stand-in for `AdminRealtimeService` (#36): no socket, no network. Specs
 * push state changes and presence events by hand.
 */
export class FakeRealtime implements AdminLiveSource {
  readonly states = new Subject<AdminRealtimeState>();
  readonly stopped = new Subject<WebPingsStopped>();
  readonly resumed = new Subject<WebPingsResumed>();
  readonly offline = new Subject<WebAutoOffline>();
  readonly stateChanges$ = this.states.asObservable();
  readonly webPingsStopped$ = this.stopped.asObservable();
  readonly webPingsResumed$ = this.resumed.asObservable();
  readonly webAutoOffline$ = this.offline.asObservable();
  connects = 0;
  disconnects = 0;

  async connect(): Promise<void> {
    this.connects++;
  }

  disconnect(): void {
    this.disconnects++;
  }
}
