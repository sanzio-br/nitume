// RealtimeService (ui-kit spec §6): port of nitume_core
// SocketIoRealtimeClient (customer RealtimeClient + RunnerRealtimeClient).
//
// - Handshake `auth: { token }` on `/socket.io`, websocket only, the
//   service owns reconnection (`reconnection: false`).
// - After a drop, a refused handshake or a server kick: close the socket,
//   `reconnecting`, wait the backoff, ask the token provider for a FRESH
//   token, open a new socket. A null token ends in `disconnected`.
// - Re-joins every errand room joined through `joinErrand` on each connect.
// - Hot, no-replay streams; malformed payloads are dropped, never thrown.
// - Tokens come only from REALTIME_TOKEN_PROVIDER (issue #6).
// - A handshake refused with `account_suspended` (PR #25) is final: no
//   retry, `disconnected`, rooms cleared, REALTIME_ACCOUNT_SUSPENDED called
//   once (issue #6, auth-foundation §5 item 8).
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  ErrandAccessRevoked,
  ErrandStatusChanged,
  EvidenceUploaded,
  JobOfferWithdrawn,
  JobOffered,
  LocationPing,
  LocationPingAck,
  LocationUpdate,
  MerchantDetailsChanged,
  MerchantDetailsUpdated,
  PING_NOT_SENT,
  PriceChangeDecided,
  PriceChangeRequested,
  PriceDifferencePaid,
  QuoteReissued,
  QuoteRequested,
  REALTIME_PATH,
  RealtimeConnectionState,
  RealtimeEvents,
  RealtimeParsers,
  isJoinAckOk,
  locationPingToJson,
} from './realtime.events';
import {
  REALTIME_ACCOUNT_SUSPENDED,
  REALTIME_ACK_TIMEOUT_MS,
  REALTIME_BACKOFF,
  REALTIME_TOKEN_PROVIDER,
  REALTIME_URL,
  RealtimeSocket,
  SOCKET_IO_FACTORY,
  isSuspendedConnectError,
} from './realtime.tokens';

type JoinResult = 'ok' | 'refused' | 'timeout';

/** The caller's DestroyRef when called in an injection context, else null. */
function callerDestroyRef(): DestroyRef | null {
  try {
    return inject(DestroyRef);
  } catch {
    return null;
  }
}

/** Copy for the not-connected state (§6.6): single U+2026 ellipsis. */
export const RECONNECTING_COPY = 'Reconnecting\u2026';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly factory = inject(SOCKET_IO_FACTORY);
  private readonly tokenProvider = inject(REALTIME_TOKEN_PROVIDER);
  private readonly backoff = inject(REALTIME_BACKOFF);
  private readonly url = inject(REALTIME_URL);
  private readonly onAccountSuspended = inject(REALTIME_ACCOUNT_SUSPENDED);

  private readonly stateSignal = signal<RealtimeConnectionState>('disconnected');
  /** `disconnected | connecting | connected | reconnecting`. */
  readonly state: Signal<RealtimeConnectionState> = this.stateSignal.asReadonly();

  // --- server → client streams (hot, no replay) ---
  private readonly locations = new Subject<LocationUpdate>();
  private readonly statuses = new Subject<ErrandStatusChanged>();
  private readonly evidence = new Subject<EvidenceUploaded>();
  private readonly priceChanges = new Subject<PriceChangeRequested>();
  private readonly quotes = new Subject<QuoteReissued>();
  private readonly merchantUpdates = new Subject<MerchantDetailsUpdated>();
  private readonly merchantChanges = new Subject<MerchantDetailsChanged>();
  private readonly quoteRequestsSubject = new Subject<QuoteRequested>();
  private readonly revocations = new Subject<ErrandAccessRevoked>();
  private readonly offers = new Subject<JobOffered>();
  private readonly withdrawals = new Subject<JobOfferWithdrawn>();
  private readonly priceDecisions = new Subject<PriceChangeDecided>();
  private readonly differencePayments = new Subject<PriceDifferencePaid>();

  readonly locationUpdates$: Observable<LocationUpdate> = this.locations.asObservable();
  readonly statusChanges$: Observable<ErrandStatusChanged> = this.statuses.asObservable();
  readonly evidenceUploads$: Observable<EvidenceUploaded> = this.evidence.asObservable();
  readonly priceChangeRequests$: Observable<PriceChangeRequested> = this.priceChanges.asObservable();
  readonly quoteReissues$: Observable<QuoteReissued> = this.quotes.asObservable();
  readonly merchantDetailsUpdates$: Observable<MerchantDetailsUpdated> =
    this.merchantUpdates.asObservable();
  readonly merchantDetailsChanges$: Observable<MerchantDetailsChanged> =
    this.merchantChanges.asObservable();
  readonly quoteRequests$: Observable<QuoteRequested> = this.quoteRequestsSubject.asObservable();
  readonly accessRevocations$: Observable<ErrandAccessRevoked> = this.revocations.asObservable();
  readonly jobOffers$: Observable<JobOffered> = this.offers.asObservable();
  readonly jobOfferWithdrawals$: Observable<JobOfferWithdrawn> = this.withdrawals.asObservable();
  readonly priceChangeDecisions$: Observable<PriceChangeDecided> = this.priceDecisions.asObservable();
  readonly priceDifferencePayments$: Observable<PriceDifferencePaid> =
    this.differencePayments.asObservable();

  private readonly rooms = new Set<string>();
  private socket: RealtimeSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  private attempt = 0;
  /** Bumped by connect()/disconnect() so a pending token request is discarded. */
  private generation = 0;
  private readonly stateListeners = new Set<(state: RealtimeConnectionState) => void>();

  constructor() {
    const onOnline = () => this.retryNow();
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
      this.disconnect();
      for (const s of [
        this.locations,
        this.statuses,
        this.evidence,
        this.priceChanges,
        this.quotes,
        this.merchantUpdates,
        this.merchantChanges,
        this.quoteRequestsSubject,
        this.revocations,
        this.offers,
        this.withdrawals,
        this.priceDecisions,
        this.differencePayments,
      ]) {
        s.complete();
      }
    });
  }

  /** Called once by the signed-in shell after sign-in. */
  async connect(): Promise<void> {
    this.wanted = true;
    this.attempt = 0;
    this.clearRetry();
    this.closeSocket();
    this.setState('connecting');
    const generation = ++this.generation;
    const token = await this.tokenProvider();
    if (!this.wanted || generation !== this.generation) return;
    if (!token) {
      // Signed out (or the #5 stub): never open a socket without a token.
      this.wanted = false;
      this.setState('disconnected');
      return;
    }
    this.open(token);
  }

  /** Called on log out: stop retrying, forget rooms, close the socket. */
  disconnect(): void {
    this.wanted = false;
    this.generation++;
    this.clearRetry();
    this.rooms.clear();
    this.closeSocket();
    this.setState('disconnected');
  }

  /**
   * Joins `errand:{id}`. Resolves the ack's `ok`. While not connected, or
   * when the ack does not arrive within 10 s, resolves false and keeps the
   * room for the next (re)connect. A refused join forgets the room.
   */
  async joinErrand(errandId: string): Promise<boolean> {
    this.rooms.add(errandId);
    if (this.stateSignal() !== 'connected') return false;
    const result = await this.join(errandId);
    if (result === 'refused') this.rooms.delete(errandId);
    return result === 'ok';
  }

  leaveErrand(errandId: string): void {
    this.rooms.delete(errandId);
    if (this.stateSignal() === 'connected') {
      this.socket?.emit(RealtimeEvents.errandLeave, { errandId });
    }
  }

  /** Rooms re-joined after a reconnect (read-only view for views/tests). */
  joinedErrands(): ReadonlySet<string> {
    return new Set(this.rooms);
  }

  /** Runner pings. `{ ok:false, sent:false }` when not connected or no ack in 10 s. */
  sendLocationPing(ping: LocationPing): Promise<LocationPingAck> {
    const s = this.socket;
    if (!s || this.stateSignal() !== 'connected') return Promise.resolve(PING_NOT_SENT);
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        resolve(PING_NOT_SENT);
      }, REALTIME_ACK_TIMEOUT_MS);
      s.emit(RealtimeEvents.locationPing, locationPingToJson(ping), (ack: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(RealtimeParsers.locationPingAck(ack));
      });
    });
  }

  /**
   * True once the service has been trying to connect (`connecting` or
   * `reconnecting`) for `delayMs` (runner 5000). `connected` and
   * `disconnected` (signed out, never connected, stub provider) clear the
   * timer and hide it (Flutter jobs_tab `_syncReconnecting`).
   * Copy: `RECONNECTING_COPY` (U+2026).
   *
   * The listener is removed when the caller is destroyed: pass its
   * `DestroyRef`, or call from an injection context (component field or
   * constructor), where the caller's `DestroyRef` is used.
   */
  showReconnecting(delayMs: number, destroyRef?: DestroyRef): Signal<boolean> {
    const visible = signal(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onState = (state: RealtimeConnectionState) => {
      const trying = state === 'connecting' || state === 'reconnecting';
      if (!trying) {
        clear();
        visible.set(false);
        return;
      }
      // Still trying: keep counting from the first attempt.
      timer ??= setTimeout(() => {
        timer = null;
        visible.set(true);
      }, delayMs);
    };
    this.stateListeners.add(onState);
    onState(this.stateSignal());
    (destroyRef ?? callerDestroyRef())?.onDestroy(() => {
      this.stateListeners.delete(onState);
      clear();
    });
    return visible.asReadonly();
  }

  /**
   * Calls `listener` on every later state transition (#7, §W9a: views react
   * to `state` without `effect()` or `toObservable`). Removed when
   * `destroyRef` is destroyed or when the returned function is called.
   * `showReconnecting` uses the same listener set.
   */
  onStateChange(listener: (state: RealtimeConnectionState) => void, destroyRef: DestroyRef): () => void {
    this.stateListeners.add(listener);
    const remove = () => {
      this.stateListeners.delete(listener);
    };
    destroyRef.onDestroy(remove);
    return remove;
  }

  // -------------------------------------------------------------------------

  private open(token: string): void {
    const s = this.factory(this.url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      autoConnect: true,
    });
    this.socket = s;
    const current = () => this.socket === s;

    s.on('connect', () => {
      if (!current()) return;
      this.attempt = 0;
      this.setState('connected');
      for (const id of [...this.rooms]) {
        void this.join(id).then((result) => {
          if (result === 'refused') this.rooms.delete(id);
        });
      }
    });
    s.on('disconnect', () => {
      if (current()) this.scheduleRetry();
    });
    s.on('connect_error', (error: never) => {
      if (!current()) return;
      if (isSuspendedConnectError(error)) {
        this.disconnect();
        this.onAccountSuspended();
        return;
      }
      this.scheduleRetry();
    });

    this.listen(s, RealtimeEvents.locationUpdate, RealtimeParsers.locationUpdate, this.locations);
    this.listen(s, RealtimeEvents.errandStatusChanged, RealtimeParsers.errandStatusChanged, this.statuses);
    this.listen(s, RealtimeEvents.evidenceUploaded, RealtimeParsers.evidenceUploaded, this.evidence);
    this.listen(s, RealtimeEvents.priceChangeRequested, RealtimeParsers.priceChangeRequested, this.priceChanges);
    this.listen(s, RealtimeEvents.quoteReissued, RealtimeParsers.quoteReissued, this.quotes);
    this.listen(s, RealtimeEvents.merchantDetailsUpdated, RealtimeParsers.merchantDetailsUpdated, this.merchantUpdates);
    this.listen(s, RealtimeEvents.merchantDetailsChanged, RealtimeParsers.merchantDetailsChanged, this.merchantChanges);
    this.listen(s, RealtimeEvents.quoteRequested, RealtimeParsers.quoteRequested, this.quoteRequestsSubject);
    this.listen(
      s,
      RealtimeEvents.errandAccessRevoked,
      (data) => {
        const revoked = RealtimeParsers.errandAccessRevoked(data);
        // No longer re-joined after a reconnect; removed before emitting.
        this.rooms.delete(revoked.errandId);
        return revoked;
      },
      this.revocations,
    );
    this.listen(s, RealtimeEvents.jobOffered, RealtimeParsers.jobOffered, this.offers);
    this.listen(s, RealtimeEvents.jobOfferWithdrawn, RealtimeParsers.jobOfferWithdrawn, this.withdrawals);
    this.listen(s, RealtimeEvents.priceChangeDecided, RealtimeParsers.priceChangeDecided, this.priceDecisions);
    this.listen(
      s,
      RealtimeEvents.priceChangeDifferencePaid,
      RealtimeParsers.priceDifferencePaid,
      this.differencePayments,
    );
  }

  private listen<T>(
    s: RealtimeSocket,
    event: string,
    parse: (data: unknown) => T,
    sink: Subject<T>,
  ): void {
    s.on(event, (data: never) => {
      if (this.socket !== s || sink.closed) return;
      let parsed: T;
      try {
        parsed = parse(data);
      } catch {
        return; // Malformed payload: drop it.
      }
      sink.next(parsed);
    });
  }

  private join(errandId: string): Promise<JoinResult> {
    const s = this.socket;
    if (!s) return Promise.resolve('timeout');
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        resolve('timeout');
      }, REALTIME_ACK_TIMEOUT_MS);
      s.emit(RealtimeEvents.errandJoin, { errandId }, (ack: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(isJoinAckOk(ack) ? 'ok' : 'refused');
      });
    });
  }

  private scheduleRetry(): void {
    if (!this.wanted) return;
    this.closeSocket();
    this.setState('reconnecting');
    if (this.retryTimer) return;
    this.attempt++;
    this.retryTimer = setTimeout(() => void this.retry(), this.backoff(this.attempt));
  }

  /** Window `online` while reconnecting: retry at once (attempt unchanged). */
  private retryNow(): void {
    if (!this.wanted || this.stateSignal() !== 'reconnecting' || !this.retryTimer) return;
    this.clearRetry();
    void this.retry();
  }

  private async retry(): Promise<void> {
    this.retryTimer = null;
    if (!this.wanted) return;
    const generation = this.generation;
    const token = await this.tokenProvider();
    if (!this.wanted || generation !== this.generation) return;
    if (!token) {
      // Signed out meanwhile: stay down until connect() is called again.
      this.wanted = false;
      this.setState('disconnected');
      return;
    }
    this.open(token);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private closeSocket(): void {
    const s = this.socket;
    this.socket = null;
    s?.disconnect();
  }

  private setState(next: RealtimeConnectionState): void {
    if (this.stateSignal() === next) return;
    this.stateSignal.set(next);
    for (const listener of this.stateListeners) listener(next);
  }
}
