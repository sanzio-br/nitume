import { ForbiddenException, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ACCOUNT_SUSPENDED, ACCOUNT_SUSPENDED_MESSAGE } from '../common/api-error';
import { AuthContext, Public } from '../common/decorators/auth.decorators';
import { ErrandStatus, UserRole, UserStatus } from '../common/enums';
import {
  ErrandsService,
  MerchantDetailsUpdatedEvent,
  OfferMadeEvent,
  OfferWithdrawnEvent,
  QuoteReissuedEvent,
  QuoteRequestedEvent,
} from '../errands/errands.service';
import { LocationIngestService } from '../location/location-ingest.service';
import { MerchantDetailsChangedEvent, PriceDifferencePaidEvent } from '../payments/payment-events';
import {
  PresenceClient,
  RunnerPresenceService,
  WEB_AUTO_OFFLINE_EVENT,
  WEB_PINGS_RESUMED_EVENT,
  WEB_PINGS_STOPPED_EVENT,
  WebAutoOfflineEvent,
  WebPingsResumedEvent,
  WebPingsStoppedEvent,
  presenceClientOf,
} from '../runners/runner-presence.service';
import { RunnersService } from '../runners/runners.service';
import {
  USER_STATUS_CHANGED,
  UserAccessService,
  UserStatusChangedEvent,
} from '../users/user-access.service';
import {
  ADMIN_ROOM,
  DomainEvent,
  EvidenceUploadedEvent,
  JobOfferedPayload,
  JobOfferWithdrawnPayload,
  JoinAck,
  LocationPingAck,
  LocationUpdatePayload,
  PriceChangeDecidedEvent,
  PriceChangeRequestedEvent,
  SocketClientEvent,
  SocketServerEvent,
  errandRoom,
  runnerRoom,
  userRoom,
} from './realtime.events';

interface StatusChangedEvent {
  errandId: string;
  status: ErrandStatus;
  from?: ErrandStatus | null;
  actor: string;
}

interface SocketData {
  user?: AuthContext;
  /** True once the handshake middleware ran the token check. */
  authChecked?: boolean;
  /** Set on connect for a runner with a profile (RA-5 room). */
  runnerProfileId?: string;
  /** Issue #36: `handshake.auth.client === 'web'` -> `'web'`, anything else `'app'`. */
  client?: PresenceClient;
}

type AuthedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

type AuthResult =
  | { kind: 'ok'; user: AuthContext }
  | { kind: 'suspended' }
  | { kind: 'invalid' };

/** Socket.IO `connect_error` for a suspended or banned account (issue #23). */
export interface AccountSuspendedConnectError extends Error {
  data: { statusCode: 401; code: string; message: string };
}

const accountSuspendedConnectError = (): AccountSuspendedConnectError =>
  Object.assign(new Error(ACCOUNT_SUSPENDED), {
    data: { statusCode: 401 as const, code: ACCOUNT_SUSPENDED, message: ACCOUNT_SUSPENDED_MESSAGE },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Socket.IO gateway (§4). Clients connect with the same short-lived access
 * JWT as REST (`auth: { token }` or `Authorization: Bearer`), then join
 * `errand:{id}` rooms they are allowed to view. Server-side pushes are driven
 * by in-process domain events (§3.3: Realtime subscribes to
 * `errand.status_changed`). Single instance for now: the Redis adapter
 * (§4.1) is needed before running more than one API instance.
 */
@Public()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: UserAccessService,
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly location: LocationIngestService,
    @Optional() private readonly presence?: RunnerPresenceService,
  ) {}

  /**
   * Issue #23: the token is checked in the handshake middleware, so a
   * suspended or banned account is refused before it connects, with a
   * `connect_error` whose `message` is `account_suspended` and whose `data`
   * is the HTTP body (`{ statusCode: 401, code, message }`). A missing or
   * invalid token keeps the earlier behaviour (connect, then disconnect), as
   * does a token issued before the account's last suspension or ban (#24).
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.checkHandshake(socket as AuthedSocket).then(
        (refusal) => next(refusal ?? undefined),
        () => next(),
      );
    });
  }

  /** Runs the token check once; returns the refusal for a suspended account. */
  async checkHandshake(client: AuthedSocket): Promise<AccountSuspendedConnectError | null> {
    const result = await this.authenticate(client);
    client.data.authChecked = true;
    if (result.kind === 'ok') {
      client.data.user = result.user;
    }
    return result.kind === 'suspended' ? accountSuspendedConnectError() : null;
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    if (!client.data.authChecked && (await this.checkHandshake(client))) {
      client.disconnect(true);
      return;
    }
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    await client.join(userRoom(user.userId));
    // Closes the gap between the handshake check and joining `user:{id}`: a
    // suspension in between found no socket to disconnect.
    const now = await this.access.accessOf(user.userId).catch(() => null);
    if (now?.status !== UserStatus.ACTIVE) {
      client.disconnect(true);
      return;
    }
    if (user.role === UserRole.ADMIN) {
      await client.join(ADMIN_ROOM);
    }
    if (user.role === UserRole.RUNNER) {
      // RA-5, row 139: the runner room comes from the JWT, never the client.
      try {
        const profile = await this.runners.profileByUserId(user.userId);
        client.data.runnerProfileId = profile.id;
        await client.join(runnerRoom(profile.id));
        // Issue #36: a web socket starts the "no ping" clock even before the first ping.
        client.data.client = presenceClientOf(client.handshake.auth);
        await this.presence?.recordConnect(profile.id, client.data.client);
      } catch (err) {
        this.logger.warn(`Runner ${user.userId} connected without a runner room: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Issue #23: when an account is suspended or banned every live socket of
   * it is disconnected (the client's reconnect is then refused at the
   * handshake). Never throws.
   */
  @OnEvent(USER_STATUS_CHANGED)
  onUserStatusChanged(event: UserStatusChangedEvent): void {
    if (event.status === UserStatus.ACTIVE || !this.server) {
      return;
    }
    try {
      this.server.in(userRoom(event.userId)).disconnectSockets(true);
    } catch (err) {
      this.logger.error(
        `Could not disconnect sockets of ${event.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @SubscribeMessage(SocketClientEvent.ERRAND_JOIN)
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { errandId?: unknown } | undefined,
  ): Promise<JoinAck> {
    const user = client.data.user;
    const errandId = typeof body?.errandId === 'string' ? body.errandId : '';
    if (!user) {
      return { ok: false, error: 'unauthenticated' };
    }
    if (!UUID.test(errandId)) {
      return { ok: false, error: 'invalid_errand_id' };
    }
    try {
      await this.errands.getById(errandId, { role: user.role, userId: user.userId });
    } catch {
      return { ok: false, error: 'forbidden' };
    }
    const room = errandRoom(errandId);
    await client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage(SocketClientEvent.ERRAND_LEAVE)
  async leave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { errandId?: unknown } | undefined,
  ): Promise<JoinAck> {
    const errandId = typeof body?.errandId === 'string' ? body.errandId : '';
    if (!UUID.test(errandId)) {
      return { ok: false, error: 'invalid_errand_id' };
    }
    const room = errandRoom(errandId);
    await client.leave(room);
    return { ok: true, room };
  }

  /**
   * RA-4, §4.2: runner position. Ack `LocationPingAck`. The intake accepts
   * job pings only from the runner on the accepted assignment while the job
   * is RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, so the customer never sees
   * an open offer's runner (row 183).
   */
  @SubscribeMessage(SocketClientEvent.LOCATION_PING)
  async locationPing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<LocationPingAck> {
    if (!client.data.user) {
      return { ok: false, error: 'unauthenticated' };
    }
    return this.location.ingest(client.data.user, body, new Date(), client.data.client ?? presenceClientOf(client.handshake.auth));
  }

  /**
   * §4.2 live position push to `errand:{id}` and the admins' live map
   * (`admins`, §4.2 `admin:live-map`), fed by the Redis fan-out
   * (`LocationRelay`).
   */
  emitLocationUpdate(payload: LocationUpdatePayload): void {
    this.server
      ?.to([errandRoom(payload.errandId), ADMIN_ROOM])
      .emit(SocketServerEvent.LOCATION_UPDATE, payload);
  }

  /**
   * Status pushes go out after the room is re-checked: a status change can
   * move the current assignment (assign, reassignment, terminal states), so
   * sockets whose user can no longer view the errand are removed first
   * (reviewer follow-up, row 65).
   */
  @OnEvent(DomainEvent.ERRAND_STATUS_CHANGED, { async: true })
  async onStatusChanged(event: StatusChangedEvent): Promise<void> {
    await this.revalidateRoom(event.errandId);
    this.server?.to(errandRoom(event.errandId)).emit(SocketServerEvent.ERRAND_STATUS_CHANGED, {
      errandId: event.errandId,
      status: event.status,
      from: event.from ?? null,
      at: new Date().toISOString(),
    });
  }

  @OnEvent(DomainEvent.EVIDENCE_UPLOADED)
  onEvidenceUploaded(event: EvidenceUploadedEvent): void {
    this.server
      ?.to(errandRoom(event.errandId))
      .emit(SocketServerEvent.EVIDENCE_UPLOADED, event);
  }

  @OnEvent(DomainEvent.PRICE_CHANGE_REQUESTED)
  onPriceChangeRequested(event: PriceChangeRequestedEvent): void {
    this.server
      ?.to(errandRoom(event.errandId))
      .emit(SocketServerEvent.PRICE_CHANGE_REQUESTED, event);
  }

  @OnEvent(DomainEvent.QUOTE_REISSUED)
  onQuoteReissued(event: QuoteReissuedEvent): void {
    this.server?.to(errandRoom(event.errandId)).emit(SocketServerEvent.QUOTE_REISSUED, event);
  }

  /** Merchant Till/Paybill set (rows 42-44); per-socket payload (issue #28). */
  @OnEvent(DomainEvent.MERCHANT_DETAILS_UPDATED, { async: true })
  async onMerchantDetailsUpdated(event: MerchantDetailsUpdatedEvent): Promise<void> {
    await this.emitMerchantDetails(SocketServerEvent.MERCHANT_DETAILS_UPDATED, event);
  }

  /**
   * Issue #28 (owner, 2026-10-29): sends a merchant_details event to every
   * socket in `errand:{id}`. Runner and admin sockets get the payload as
   * is; a customer socket gets `tillNumber`, `paybillNumber` and
   * `accountReference` as null until the errand's fee payment has
   * completed (same check as GET /errands/:id). If that check fails the
   * customer gets the null payload. Never throws.
   */
  private async emitMerchantDetails<
    T extends {
      errandId: string;
      tillNumber: string | null;
      paybillNumber: string | null;
      accountReference: string | null;
    },
  >(name: string, event: T): Promise<void> {
    if (!this.server) {
      return;
    }
    const room = errandRoom(event.errandId);
    try {
      const sockets = await this.server.in(room).fetchSockets();
      const privileged = (socket: { data: unknown }): boolean => {
        const role = (socket.data as SocketData | undefined)?.user?.role;
        return role === UserRole.RUNNER || role === UserRole.ADMIN;
      };
      let customerPayload: T = { ...event, tillNumber: null, paybillNumber: null, accountReference: null };
      if (sockets.some((s) => !privileged(s))) {
        const visible = await this.errands
          .merchantNumbersVisibleTo(UserRole.CUSTOMER, event.errandId)
          .catch((err: unknown) => {
            this.logger.warn(
              `Fee check for ${room} failed; merchant numbers withheld from customers: ${err instanceof Error ? err.message : String(err)}`,
            );
            return false;
          });
        if (visible) {
          customerPayload = event;
        }
      }
      for (const socket of sockets) {
        socket.emit(name, privileged(socket) ? event : customerPayload);
      }
    } catch (err) {
      this.logger.error(`Could not send ${name} to ${room}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @OnEvent(DomainEvent.ERRAND_ACCESS_CHANGED, { async: true })
  async onAccessChanged(event: { errandId: string }): Promise<void> {
    await this.revalidateRoom(event.errandId);
  }

  /**
   * Removes from `errand:{id}` every socket whose user can no longer view the
   * errand (same check as `errand:join`), telling it first with
   * `errand:access_revoked`. Never throws: a failed check leaves the room
   * as it was and is logged.
   */
  async revalidateRoom(errandId: string): Promise<number> {
    if (!this.server) {
      return 0;
    }
    const room = errandRoom(errandId);
    let removed = 0;
    try {
      const sockets = await this.server.in(room).fetchSockets();
      for (const socket of sockets) {
        const user = (socket.data as SocketData | undefined)?.user;
        let allowed = false;
        if (user) {
          try {
            await this.errands.getById(errandId, { role: user.role, userId: user.userId });
            allowed = true;
          } catch (err) {
            // Only a definite "no access" evicts; a transient failure keeps the socket.
            if (!(err instanceof ForbiddenException || err instanceof NotFoundException)) {
              allowed = true;
              this.logger.warn(
                `Kept a socket in ${room}; access check failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
        if (!allowed) {
          socket.emit(SocketServerEvent.ERRAND_ACCESS_REVOKED, { errandId });
          socket.leave(room);
          removed += 1;
        }
      }
    } catch (err) {
      this.logger.error(
        `Could not re-check ${room}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return removed;
  }

  /** RA-5: `job:offered` to the offered runner's own room. */
  @OnEvent(DomainEvent.OFFER_MADE)
  onOfferMade(event: OfferMadeEvent): void {
    const payload: JobOfferedPayload = {
      errandId: event.errandId,
      assignmentId: event.assignmentId,
      offerExpiresAt: event.offerExpiresAt,
      offeredAt: event.offeredAt,
    };
    this.server?.to(runnerRoom(event.runnerProfileId)).emit(SocketServerEvent.JOB_OFFERED, payload);
  }

  /** RA-5: `job:offer_withdrawn` (lapse, deadline, decline, admin cancel). */
  @OnEvent(DomainEvent.OFFER_WITHDRAWN)
  onOfferWithdrawn(event: OfferWithdrawnEvent): void {
    const payload: JobOfferWithdrawnPayload = {
      errandId: event.errandId,
      assignmentId: event.assignmentId,
      reason: event.reason,
      at: event.at,
    };
    this.server?.to(runnerRoom(event.runnerProfileId)).emit(SocketServerEvent.JOB_OFFER_WITHDRAWN, payload);
  }

  /**
   * RA-5: `price_change:decided` to the errand room and the current
   * runner's room (one delivery per socket). Never throws.
   */
  @OnEvent(DomainEvent.PRICE_CHANGE_DECIDED, { async: true })
  async onPriceChangeDecided(event: PriceChangeDecidedEvent): Promise<void> {
    const rooms = [errandRoom(event.errandId)];
    try {
      const holder = await this.errands.activeAssignmentFor(event.errandId);
      if (holder) {
        rooms.push(runnerRoom(holder.runnerProfileId));
      }
    } catch (err) {
      this.logger.warn(`price_change:decided without the runner room: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.server?.to(rooms).emit(SocketServerEvent.PRICE_CHANGE_DECIDED, event);
  }

  /**
   * Row 248: `price_change:difference_paid` to the errand room and the
   * current runner's room (one delivery per socket). Never throws.
   */
  @OnEvent(DomainEvent.PRICE_CHANGE_DIFFERENCE_PAID, { async: true })
  async onPriceDifferencePaid(event: PriceDifferencePaidEvent): Promise<void> {
    const rooms = [errandRoom(event.errandId)];
    try {
      const holder = await this.errands.activeAssignmentFor(event.errandId);
      if (holder) {
        rooms.push(runnerRoom(holder.runnerProfileId));
      }
    } catch (err) {
      this.logger.warn(`price_change:difference_paid without the runner room: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.server?.to(rooms).emit(SocketServerEvent.PRICE_CHANGE_DIFFERENCE_PAID, event);
  }

  /** Merchant details changed after a merchant-direct payment started (row 80). */
  @OnEvent(DomainEvent.MERCHANT_DETAILS_CHANGED, { async: true })
  async onMerchantDetailsChanged(event: MerchantDetailsChangedEvent): Promise<void> {
    await this.emitMerchantDetails(SocketServerEvent.MERCHANT_DETAILS_CHANGED, event);
  }

  /**
   * Issue #36 (owner Q14-5): a web runner, online or busy, sent no location
   * for `location.webStaleSeconds`. Once per silence, to `admins`.
   */
  @OnEvent(WEB_PINGS_STOPPED_EVENT)
  onWebPingsStopped(event: WebPingsStoppedEvent): void {
    this.server?.to(ADMIN_ROOM).emit(SocketServerEvent.RUNNER_WEB_PINGS_STOPPED, {
      runnerProfileId: event.runnerProfileId,
      lastPingAt: event.lastPingAt,
      at: event.at,
    });
  }

  /** Issue #36: the flagged runner pinged again (or reconnected from the app); the flag is cleared. */
  @OnEvent(WEB_PINGS_RESUMED_EVENT)
  onWebPingsResumed(event: WebPingsResumedEvent): void {
    this.server?.to(ADMIN_ROOM).emit(SocketServerEvent.RUNNER_WEB_PINGS_RESUMED, {
      runnerProfileId: event.runnerProfileId,
      at: event.at,
    });
  }

  /** Issue #36 (owner Q14-6): an idle web runner was set offline by the system. */
  @OnEvent(WEB_AUTO_OFFLINE_EVENT)
  onWebAutoOffline(event: WebAutoOfflineEvent): void {
    this.server?.to(ADMIN_ROOM).emit(SocketServerEvent.RUNNER_WEB_AUTO_OFFLINE, {
      runnerProfileId: event.runnerProfileId,
      lastPingAt: event.lastPingAt,
      at: event.at,
    });
  }

  /** Customer asked for a new quote (row 68): admins and the errand room. */
  @OnEvent(DomainEvent.QUOTE_REQUESTED)
  onQuoteRequested(event: QuoteRequestedEvent): void {
    this.server
      ?.to([ADMIN_ROOM, errandRoom(event.errandId)])
      .emit(SocketServerEvent.QUOTE_REQUESTED, event);
  }

  private async authenticate(client: AuthedSocket): Promise<AuthResult> {
    const token = tokenFrom(client);
    if (!token) {
      return { kind: 'invalid' };
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; type?: string; iat?: number }>(token, {
        secret: this.config.get<string>('jwt.accessSecret') as string,
      });
      if (payload.type !== 'access' || !payload.sub) {
        return { kind: 'invalid' };
      }
      const user = await this.access.accessOf(payload.sub);
      if (!user) {
        return { kind: 'invalid' };
      }
      if (user.status !== UserStatus.ACTIVE) {
        return { kind: 'suspended' };
      }
      // Issue #24: a token issued before the last suspension or ban is
      // treated like an invalid one (connect, then disconnect; no code).
      if (await this.access.isTokenRevoked(payload.sub, payload.iat)) {
        return { kind: 'invalid' };
      }
      return {
        kind: 'ok',
        user: { userId: payload.sub, role: user.role, phone: user.phone, status: user.status },
      };
    } catch (err) {
      this.logger.debug(`Socket auth rejected: ${err instanceof Error ? err.message : String(err)}`);
      return { kind: 'invalid' };
    }
  }
}

const tokenFrom = (client: AuthedSocket): string | null => {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token.length > 0) {
    return auth.token.replace(/^Bearer\s+/i, '');
  }
  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, '');
  }
  return null;
};
