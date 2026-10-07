import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DisputeEventType,
  DisputeStatus,
  ErrandStatus,
  StatusHistoryActor,
  UserRole,
} from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { DisputeEvent } from './dispute-event.entity';
import { Dispute } from './dispute.entity';
import { OpenDisputeDto } from './dto/dispute.dto';

export interface DisputeView extends Dispute {
  events: DisputeEvent[];
}

interface Actor {
  userId: string;
  role: UserRole;
}

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputes: Repository<Dispute>,
    @InjectRepository(DisputeEvent)
    private readonly events: Repository<DisputeEvent>,
    private readonly errands: ErrandsService,
  ) {}

  /**
   * Customer opens a dispute ("report a problem"). The errand moves to
   * DISPUTED through the existing state machine (customer actor, owner-only)
   * and the dispute + its `opened` event are written in the same
   * transaction. Illegal source states surface as 409 from the state machine.
   */
  async open(dto: OpenDisputeDto, actor: Actor): Promise<DisputeView> {
    const existing = await this.disputes.findOne({ where: { errandId: dto.errandId } });
    if (existing) {
      throw new ConflictException('A dispute already exists for this task');
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
        return Object.assign(dispute, { events: [opened] });
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
    return Object.assign(dispute, { events });
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
    return Object.assign(dispute, { events });
  }
}
