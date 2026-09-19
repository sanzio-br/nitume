import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';
import {
  ErrandStatus,
  GeoPoint,
  StatusHistoryActor,
  AssignmentStatus,
} from '../common/enums';
import { CustomerProfile } from '../customers/customer-profile.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { ErrandAssignment } from './errand-assignment.entity';
import { ErrandItem } from './errand-item.entity';
import { ErrandLocation } from './errand-location.entity';
import { ErrandStateMachine } from './errand-state-machine';
import { ErrandStatusHistory } from './errand-status-history.entity';
import { Errand } from './errand.entity';
import { Quote } from './quote.entity';
import {
  CreateErrandDto,
  ErrandItemDto,
  ErrandLocationDto,
} from './dto/errand.dto';

export interface ActorReference {
  type: StatusHistoryActor;
  id?: string | null;
}

export interface ViewerContext {
  role: string;
  userId: string;
}

export interface QuoteInput {
  total: number;
  baseFee?: number;
  distanceFee?: number;
  timeFee?: number;
  urgencyFee?: number;
  complexityFee?: number;
  premiumFee?: number;
  currency?: string;
  expiresAt?: string;
}

export interface ErrandResult {
  errand: Errand;
  history: ErrandStatusHistory;
}

export interface ListErrandsResponse {
  items: Errand[];
  nextCursor: string | null;
}

const pointToGeo = (loc: ErrandLocationDto): GeoPoint => ({
  type: 'Point',
  coordinates: [loc.lon, loc.lat],
});

@Injectable()
export class ErrandsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(ErrandLocation)
    private readonly locations: Repository<ErrandLocation>,
    @InjectRepository(ErrandItem)
    private readonly items: Repository<ErrandItem>,
    @InjectRepository(ErrandStatusHistory)
    private readonly history: Repository<ErrandStatusHistory>,
    @InjectRepository(ErrandAssignment)
    private readonly assignments: Repository<ErrandAssignment>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfiles: Repository<CustomerProfile>,
    @InjectRepository(RunnerProfile)
    private readonly runnerProfiles: Repository<RunnerProfile>,
    private readonly events: EventEmitter2,
  ) {}

  async createDraft(
    customerUserId: string,
    dto: CreateErrandDto,
    actor: ActorReference,
  ): Promise<ErrandResult> {
    return this.dataSource.transaction(async (manager) => {
      const profile = await manager
        .getRepository(CustomerProfile)
        .findOne({ where: { userId: customerUserId } });
      if (!profile) {
        throw new ForbiddenException('Customer profile not found');
      }

      const errand = manager.getRepository(Errand).create({
        customerId: profile.id,
        category: dto.category,
        description: dto.description,
        budget: dto.budget.toString(),
        deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
        urgency: dto.urgency,
        status: ErrandStatus.DRAFT,
      });
      const saved = await manager.getRepository(Errand).save(errand);

      const locationRows = dto.locations.map((loc) =>
        manager.getRepository(ErrandLocation).create({
          errandId: saved.id,
          pointType: loc.pointType,
          coordinates: pointToGeo(loc),
          addressText: loc.addressText,
          placeId: loc.placeId ?? null,
        }),
      );
      await manager.getRepository(ErrandLocation).save(locationRows);

      if (dto.items && dto.items.length > 0) {
        const itemRows = dto.items.map((item: ErrandItemDto) =>
          manager.getRepository(ErrandItem).create({
            errandId: saved.id,
            name: item.name,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            notes: item.notes ?? null,
          }),
        );
        await manager.getRepository(ErrandItem).save(itemRows);
      }

      const history = await this.appendHistory(manager, saved.id, {
        fromStatus: null,
        toStatus: ErrandStatus.DRAFT,
        actor: { type: actor.type, id: actor.id ?? null },
        note: 'Errand created as draft',
      });

      return { errand: saved, history };
    });
  }

  async getById(
    errandId: string,
    viewer?: ViewerContext,
  ): Promise<Errand> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (viewer && !(await this.canView(errand, viewer))) {
      throw new ForbiddenException('You do not have access to this errand');
    }
    return errand;
  }

  async listFor(
    viewer: ViewerContext,
    opts: { status?: ErrandStatus; limit?: number; cursor?: string | null },
  ): Promise<ListErrandsResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qb = this.errands.createQueryBuilder('e');

    if (viewer.role === 'admin') {
      if (opts.status) {
        qb.where('e.status = :status', { status: opts.status });
      }
    } else if (viewer.role === 'runner') {
      const runnerProfile = await this.runnerProfiles.findOne({
        where: { userId: viewer.userId },
      });
      if (!runnerProfile) {
        throw new ForbiddenException('Runner profile not found');
      }
      qb.innerJoin(
        ErrandAssignment,
        'a',
        'a."errandId" = e.id AND a."runnerProfileId" = :runnerProfileId',
        { runnerProfileId: runnerProfile.id },
      );
      if (opts.status) {
        qb.andWhere('e.status = :status', { status: opts.status });
      }
    } else {
      const profile = await this.customerProfiles.findOne({
        where: { userId: viewer.userId },
      });
      if (!profile) {
        throw new ForbiddenException('Customer profile not found');
      }
      qb.where('e."customerId" = :profileId', { profileId: profile.id });
      if (opts.status) {
        qb.andWhere('e.status = :status', { status: opts.status });
      }
      qb.andWhere('e.status != :draft', { draft: ErrandStatus.DRAFT });
    }

    qb.orderBy('e."createdAt"', 'DESC').addOrderBy('e.id', 'DESC').limit(limit + 1);

    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      const [createdAt, id] = decoded;
      qb.andWhere(
        '(e."createdAt" < :createdAt OR (e."createdAt" = :createdAt AND e.id < :id))',
        { createdAt: new Date(createdAt), id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Transitions an errand to a target status, validating against the strict
   * §3.3 state machine and recording a history row (append-only). Uses the
   * entity version column for optimistic concurrency: concurrent transitions
   * from the same version surface as a retryable conflict.
   */
  async transition(
    errandId: string,
    to: ErrandStatus,
    actor: ActorReference,
    note?: string,
    subject?: ViewerContext,
  ): Promise<ErrandResult> {
    return this.dataSource.transaction((manager) =>
      this.performTransition(manager, errandId, to, actor, note, subject),
    );
  }

  private async performTransition(
    manager: EntityManager,
    errandId: string,
    to: ErrandStatus,
    actor: ActorReference,
    note?: string,
    subject?: ViewerContext,
  ): Promise<ErrandResult> {
    const errand = await manager.getRepository(Errand).findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    const fromStatus = errand.status;
    if (!ErrandStateMachine.canTransition(fromStatus, to)) {
      throw new ConflictException(
        `Illegal status transition: ${fromStatus} -> ${to}`,
      );
    }
    if (!ErrandStateMachine.actorCanPerform(fromStatus, to, actor.type)) {
      throw new ForbiddenException(
        `Actor '${actor.type}' cannot perform ${fromStatus} -> ${to}`,
      );
    }
    await this.enforceSubject(manager, errand, actor, subject);

    errand.status = to;
    try {
      await manager.getRepository(Errand).save(errand);
    } catch (err) {
      if (err instanceof Error) {
        throw new ConflictException(
          'Concurrent modification detected. Retry the transition.',
        );
      }
      throw err;
    }

    const history = await this.appendHistory(manager, errandId, {
      fromStatus,
      toStatus: to,
      actor: { type: actor.type, id: actor.id ?? null },
      note: note ?? null,
    });

    setImmediate(() => {
      this.events.emit('errand.status_changed', {
        errandId,
        status: to,
        from: fromStatus,
        actor: actor.type,
      });
    });

    return { errand, history };
  }

  async historyFor(errandId: string): Promise<ErrandStatusHistory[]> {
    return this.history.find({
      where: { errandId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Admin quote step: prices the errand and moves REQUESTED -> QUOTED in one
   * transaction. The quoted price is captured on the errand; the full
   * breakdown lands in `quotes` (auditable pricing provenance).
   */
  async quote(
    errandId: string,
    quote: QuoteInput,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory; quote: Quote }> {
    return this.dataSource.transaction(async (manager) => {
      const done = await this.performTransition(
        manager,
        errandId,
        ErrandStatus.QUOTED,
        actor,
        note,
      );
      const quoteRepo = manager.getRepository(Quote);
      const row = await quoteRepo.save(
        quoteRepo.create({
          errandId,
          baseFee: (quote.baseFee ?? quote.total).toString(),
          distanceFee: (quote.distanceFee ?? 0).toString(),
          timeFee: (quote.timeFee ?? 0).toString(),
          urgencyFee: (quote.urgencyFee ?? 0).toString(),
          complexityFee: (quote.complexityFee ?? 0).toString(),
          premiumFee: (quote.premiumFee ?? 0).toString(),
          total: quote.total.toString(),
          currency: quote.currency ?? 'KES',
          expiresAt: quote.expiresAt ? new Date(quote.expiresAt) : null,
        }),
      );
      return { errand: done.errand, history: done.history, quote: row };
    });
  }

  /**
   * v1 semi-automated matching: the admin's one-click assignment. Creates an
   * accepted assignment for the runner and moves PAYMENT_CONFIRMED ->
   * RUNNER_ASSIGNED in the same transaction.
   */
  async assign(
    errandId: string,
    runnerProfileId: string,
    actor: ActorReference,
    note?: string,
  ): Promise<{ errand: Errand; history: ErrandStatusHistory; assignment: ErrandAssignment }> {
    return this.dataSource.transaction(async (manager) => {
      const runner = await manager
        .getRepository(RunnerProfile)
        .findOne({ where: { id: runnerProfileId } });
      if (!runner) {
        throw new NotFoundException('Runner profile not found');
      }
      const done = await this.performTransition(
        manager,
        errandId,
        ErrandStatus.RUNNER_ASSIGNED,
        actor,
        note,
      );
      const assignmentRepo = manager.getRepository(ErrandAssignment);
      const assignment = await assignmentRepo.save(
        assignmentRepo.create({
          errandId,
          runnerProfileId,
          status: AssignmentStatus.ASSIGNED,
          decidedAt: new Date(),
        }),
      );
      return { errand: done.errand, history: done.history, assignment };
    });
  }

  private async customerProfileIdFor(
    manager: EntityManager,
    userId: string,
  ): Promise<string | null> {
    const row = await manager
      .getRepository(CustomerProfile)
      .findOne({ where: { userId } });
    return row?.id ?? null;
  }

  private async canView(errand: Errand, viewer: ViewerContext): Promise<boolean> {
    if (viewer.role === 'admin') {
      return true;
    }
    if (viewer.role === 'runner') {
      const runnerProfile = await this.runnerProfiles.findOne({
        where: { userId: viewer.userId },
      });
      if (!runnerProfile) {
        return false;
      }
      const assignment = await this.assignments.findOne({
        where: { errandId: errand.id, runnerProfileId: runnerProfile.id },
      });
      return assignment !== null;
    }
    const ownerProfileId = await this.customerProfileIdFor(
      this.mutableEntityManager(),
      viewer.userId,
    );
    return ownerProfileId === errand.customerId;
  }

  /**
   * Alias for customerProfileIdFor outside the transaction path (getById is
   * not transactional). Reads require no in-tx entity manager semantics.
   */
  private mutableEntityManager(): EntityManager {
    return this.errands.manager;
  }

  /**
   * Subject-bound access control: a customer may only act on their own
   * errand; a runner only on errands they hold an active assignment for;
   * admins/system are subject-free.
   */
  private async enforceSubject(
    manager: EntityManager,
    errand: Errand,
    actor: ActorReference,
    subject?: ViewerContext,
  ): Promise<void> {
    switch (actor.type) {
      case StatusHistoryActor.CUSTOMER: {
        const profileId = subject
          ? await this.customerProfileIdFor(manager, subject.userId)
          : actor.id ?? null;
        if (profileId !== errand.customerId) {
          throw new ForbiddenException('You do not own this errand');
        }
        break;
      }
      case StatusHistoryActor.RUNNER: {
        const runnerProfile = subject
          ? await manager
              .getRepository(RunnerProfile)
              .findOne({ where: { userId: subject.userId } })
          : null;
        const runnerProfileId = runnerProfile?.id ?? actor.id ?? null;
        if (!runnerProfileId) {
          throw new ForbiddenException('Runner identity missing');
        }
        const assignment = await manager
          .getRepository(ErrandAssignment)
          .createQueryBuilder('a')
          .where('a."errandId" = :errandId', { errandId: errand.id })
          .andWhere('a."runnerProfileId" = :runnerProfileId', { runnerProfileId })
          .andWhere("a.status IN ('assigned', 'accepted')")
          .getOne();
        if (!assignment) {
          throw new ForbiddenException('You are not assigned to this errand');
        }
        break;
      }
      case StatusHistoryActor.ADMIN:
      case StatusHistoryActor.SYSTEM:
        break;
    }
  }

  private async appendHistory(
    manager: EntityManager,
    errandId: string,
    data: {
      fromStatus: ErrandStatus | null;
      toStatus: ErrandStatus;
      actor: { type: StatusHistoryActor; id: string | null };
      note: string | null;
    },
  ): Promise<ErrandStatusHistory> {
    const repo = manager.getRepository(ErrandStatusHistory);
    const row = repo.create({
      errandId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      actorType: data.actor.type,
      actorId: data.actor.id,
      note: data.note,
    });
    return repo.save(row);
  }
}

const encodeCursor = (errand: Errand): string =>
  Buffer.from(
    `${errand.createdAt.toISOString()}::${errand.id}`,
    'utf-8',
  ).toString('base64');

const decodeCursor = (
  cursor: string | null | undefined,
): [string, string] | null => {
  if (!cursor) {
    return null;
  }
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf-8').split('::');
    if (!createdAt || !id) {
      return null;
    }
    return [createdAt, id];
  } catch {
    return null;
  }
};