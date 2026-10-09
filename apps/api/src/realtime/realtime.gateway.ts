import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthContext, Public } from '../common/decorators/auth.decorators';
import { ErrandStatus, UserRole, UserStatus } from '../common/enums';
import {
  ErrandsService,
  MerchantDetailsUpdatedEvent,
  QuoteReissuedEvent,
  QuoteRequestedEvent,
} from '../errands/errands.service';
import { UsersService } from '../users/users.service';
import {
  ADMIN_ROOM,
  DomainEvent,
  EvidenceUploadedEvent,
  JoinAck,
  LocationUpdatePayload,
  PriceChangeRequestedEvent,
  SocketClientEvent,
  SocketServerEvent,
  errandRoom,
} from './realtime.events';

interface StatusChangedEvent {
  errandId: string;
  status: ErrandStatus;
  from?: ErrandStatus | null;
  actor: string;
}

interface SocketData {
  user?: AuthContext;
}

type AuthedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

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
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly errands: ErrandsService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const user = await this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.data.user = user;
    if (user.role === UserRole.ADMIN) {
      await client.join(ADMIN_ROOM);
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

  /** §4.2 live position push. Producer (runner `location:ping`) not built yet. */
  emitLocationUpdate(payload: LocationUpdatePayload): void {
    this.server
      ?.to(errandRoom(payload.errandId))
      .emit(SocketServerEvent.LOCATION_UPDATE, payload);
  }

  @OnEvent(DomainEvent.ERRAND_STATUS_CHANGED)
  onStatusChanged(event: StatusChangedEvent): void {
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

  @OnEvent(DomainEvent.MERCHANT_DETAILS_UPDATED)
  onMerchantDetailsUpdated(event: MerchantDetailsUpdatedEvent): void {
    this.server
      ?.to(errandRoom(event.errandId))
      .emit(SocketServerEvent.MERCHANT_DETAILS_UPDATED, event);
  }

  /** Customer asked for a new quote (row 68): admins and the errand room. */
  @OnEvent(DomainEvent.QUOTE_REQUESTED)
  onQuoteRequested(event: QuoteRequestedEvent): void {
    this.server
      ?.to([ADMIN_ROOM, errandRoom(event.errandId)])
      .emit(SocketServerEvent.QUOTE_REQUESTED, event);
  }

  private async authenticate(client: AuthedSocket): Promise<AuthContext | null> {
    const token = tokenFrom(client);
    if (!token) {
      return null;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; type?: string }>(token, {
        secret: this.config.get<string>('jwt.accessSecret') as string,
      });
      if (payload.type !== 'access' || !payload.sub) {
        return null;
      }
      const user = await this.users.findById(payload.sub);
      if (!user || user.status !== UserStatus.ACTIVE) {
        return null;
      }
      return { userId: user.id, role: user.role, phone: user.phone, status: user.status };
    } catch (err) {
      this.logger.debug(`Socket auth rejected: ${err instanceof Error ? err.message : String(err)}`);
      return null;
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
