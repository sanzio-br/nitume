import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { conflict } from '../common/api-error';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  DisputeEventType,
  DisputeStatus,
  ErrandStatus,
  StatusHistoryActor,
  UserRole,
} from '../common/enums';
import { DisputeResolutionInTx, ErrandsService } from '../errands/errands.service';
import { DisputeEvent } from './dispute-event.entity';
import { Dispute } from './dispute.entity';
import { OpenDisputeDto } from './dto/dispute.dto';

export type DisputeVerdict = 'runner_favourable' | 'customer_favourable';

/**
 * Dispute with its event log and the outcome (row 79). `resolution` is the
 * resolution note the admin wrote with the verdict; customer and runner see
 * it. For them `resolvedBy` and admin actor ids are null and `comment`
 * events (reserved for internal admin notes) are left out.
 */
export interface DisputeView extends Dispute {
  events: DisputeEvent[];
  /** Verdict of the resolution, or null while open. */
  verdict: DisputeVerdict | null;
  /** When it was resolved, or null while open. */
  resolvedAt: Date | null;
}

/** Event types a customer or runner may see; `comment` stays admin-only. */
const PARTY_EVENT_TYPES = new Set<DisputeEventType>([
  DisputeEventType.OPENED,
  DisputeEventType.EVIDENCE_ADDED,
  DisputeEventType.RESOLVED,
]);

/** Builds the viewer-specific dispute view (row 79). */
export const toDisputeView = (
  dispute: Dispute,
  events: DisputeEvent[],
  viewer: { role: UserRole },
): DisputeView => {
  const resolved = [...events].reverse().find((e) => e.eventType === DisputeEventType.RESOLVED);
  const raw = resolved?.payload?.verdict;
  const verdict: DisputeVerdict | null =
    raw === 'runner_favourable' || raw === 'customer_favourable' ? raw : null;
  const outcome = { verdict, resolvedAt: resolved?.createdAt ?? null };
  if (viewer.role === UserRole.ADMIN) {
    return Object.assign(dispute, { events }, outcome);
  }
  const visible = events
    .filter((e) => PARTY_EVENT_TYPES.has(e.eventType))
    .map((e) =>
      e.eventType === DisputeEventType.RESOLVED
        ? Object.assign(e, {
            actorId: null,
            payload: { verdict, resolution: dispute.resolution },
          })
        : e,
    );
  return Object.assign(dispute, { resolvedBy: null, events: visible }, outcome);
};

interface Actor {
  userId: string;
  role: UserRole;
}

@Injectable()
export class DisputesService implements OnModuleInit {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputes: Repository<Dispute>,
    @InjectRepository(DisputeEvent)
    private readonly events: Repository<DisputeEvent>,
    private readonly errands: ErrandsService,
  ) {}

  /**
   * Row 175: the runners with an open or under-review dispute on any task
   * they were assigned to. Their ID/selfie evidence is never purged while
   * such a dispute exists (the hold comes before the retention purge).
   */
  async runnersWithOpenDisputes(runnerProfileIds: string[], manager?: EntityManager): Promise<Set<string>> {
    const byRunner = await this.errands.errandIdsByRunner(runnerProfileIds, manager);
    const errandIds = [...new Set([...byRunner.values()].flat())];
    if (errandIds.length === 0) {
      return new Set();
    }
    const repo = manager ? manager.getRepository(Dispute) : this.disputes;
    const open = await repo.find({
      where: { errandId: In(errandIds), status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]) },
      select: { errandId: true },
    });
    const disputed = new Set(open.map((d) => d.errandId));
    return new Set([...byRunner].filter(([, ids]) => ids.some((id) => disputed.has(id))).map(([runner]) => runner));
  }

  /**
   * Row 247: the tasks among `errandIds` with an open or under-review
   * dispute. Their job location samples are kept while it is open.
   */
  async errandsWithOpenDisputes(errandIds: string[]): Promise<Set<string>> {
    const unique = [...new Set(errandIds)].filter(Boolean);
    if (unique.length === 0) {
      return new Set();
    }
    const open = await this.disputes.find({
      where: { errandId: In(unique), status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]) },
      select: { errandId: true },
    });
    return new Set(open.map((d) => d.errandId));
  }

  /** Closes the dispute row in the resolve-dispute transaction (N-6). */
  onModuleInit(): void {
    this.errands.onDisputeResolved((manager, resolution) => this.closeWithin(manager, resolution));
  }

  /**
   * Marks the errand's dispute resolved: `status=resolved`, the admin's
   * rationale as `resolution`, `resolvedBy`, plus a `resolved` event with
   * the verdict. An errand disputed without a dispute row (generic status
   * endpoint) has nothing to close.
   */
  async closeWithin(manager: EntityManager, resolution: DisputeResolutionInTx): Promise<void> {
    const repo = manager.getRepository(Dispute);
    const dispute = await repo.findOne({
      where: { errandId: resolution.errandId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!dispute || dispute.status === DisputeStatus.RESOLVED) {
      return;
    }
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolution = resolution.rationale;
    dispute.resolvedBy = resolution.adminUserId;
    await repo.save(dispute);
    await manager.getRepository(DisputeEvent).save(
      manager.getRepository(DisputeEvent).create({
        disputeId: dispute.id,
        actorId: resolution.adminUserId,
        eventType: DisputeEventType.RESOLVED,
        payload: { verdict: resolution.verdict, resolution: resolution.rationale },
      }),
    );
  }

  /**
   * Customer opens a dispute ("report a problem"). The errand moves to
   * DISPUTED through the existing state machine (customer actor, owner-only)
   * and the dispute + its `opened` event are written in the same
   * transaction. Illegal source states surface as 409 from the state machine.
   */
  async open(dto: OpenDisputeDto, actor: Actor): Promise<DisputeView> {
    const existing = await this.disputes.findOne({ where: { errandId: dto.errandId } });
    if (existing) {
      throw conflict('dispute_already_exists', 'A dispute already exists for this task');
    }
    const reason = dto.reason.trim();
    const { extra } = await this.errands.transitionWith(
      dto.errandId,
      ErrandStatus.DISPUTED,
      { type: StatusHistoryActor.CUSTOMER, id: actor.userId },
      `Dispute opened: ${reason}`.slice(0, 500),
      { role: actor.role, userId: actor.userId },
      async (manager) => {
        const dispute = await manager.getRepository(Dispute).save(
          manager.getRepository(Dispute).create({
            errandId: dto.errandId,
            openedBy: actor.userId,
            reason,
            status: DisputeStatus.OPEN,
          }),
        );
        const opened = await manager.getRepository(DisputeEvent).save(
          manager.getRepository(DisputeEvent).create({
            disputeId: dispute.id,
            actorId: actor.userId,
            eventType: DisputeEventType.OPENED,
            payload: { reason },
          }),
        );
        return Object.assign(dispute, { events: [opened], verdict: null, resolvedAt: null });
      },
    );
    return extra;
  }

  /** The errand's dispute (one per errand) with its event log; 404 when none. */
  async getForErrand(errandId: string, viewer: Actor): Promise<DisputeView> {
    await this.errands.getById(errandId, viewer);
    const dispute = await this.disputes.findOne({ where: { errandId } });
    if (!dispute) {
      throw new NotFoundException('No dispute for this task');
    }
    const events = await this.events.find({
      where: { disputeId: dispute.id },
      order: { createdAt: 'ASC' },
    });
    return toDisputeView(dispute, events, viewer);
  }

  /** Dispute with its event log, for anyone who can view the errand. */
  async get(id: string, viewer: Actor): Promise<DisputeView> {
    const dispute = await this.disputes.findOne({ where: { id } });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    await this.errands.getById(dispute.errandId, viewer);
    const events = await this.events.find({
      where: { disputeId: id },
      order: { createdAt: 'ASC' },
    });
    return toDisputeView(dispute, events, viewer);
  }
}
