import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ErrandStatus,
  PriceChangeStatus,
  UserRole,
} from '../common/enums';
import { Errand } from '../errands/errand.entity';
import { ErrandsService } from '../errands/errands.service';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { RunnerProfile } from '../runners/runner-profile.entity';
import { PriceChangeRequest } from './price-change-request.entity';
import { RequestPriceChangeDto } from './dto/price-change.dto';

const PRICE_CHANGEABLE = new Set<ErrandStatus>([
  ErrandStatus.QUOTED,
  ErrandStatus.ACCEPTED,
  ErrandStatus.PAYMENT_CONFIRMED,
  ErrandStatus.RUNNER_ASSIGNED,
  ErrandStatus.RUNNER_EN_ROUTE,
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
]);

@Injectable()
export class PriceChangeService {
  constructor(
    @InjectRepository(PriceChangeRequest)
    private readonly requests: Repository<PriceChangeRequest>,
    @InjectRepository(Errand)
    private readonly errands: Repository<Errand>,
    @InjectRepository(ErrandAssignment)
    private readonly assignments: Repository<ErrandAssignment>,
    @InjectRepository(RunnerProfile)
    private readonly runners: Repository<RunnerProfile>,
    private readonly errandService: ErrandsService,
  ) {}

  /** Assigned runner (or admin) proposes a new price for a live errand. */
  async request(
    errandId: string,
    dto: RequestPriceChangeDto,
    actor: { userId: string; role: UserRole },
  ): Promise<PriceChangeRequest> {
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand) {
      throw new NotFoundException('Errand not found');
    }
    if (!PRICE_CHANGEABLE.has(errand.status)) {
      throw new ConflictException(
        `Price changes are not allowed in status ${errand.status}`,
      );
    }
    if (actor.role !== UserRole.ADMIN) {
      const isAssignedRunner = await this.isAssignedRunner(
        errandId,
        actor.userId,
      );
      if (!isAssignedRunner) {
        throw new ForbiddenException('Only the assigned runner can request a price change');
      }
    }

    const open = await this.requests.findOne({
      where: { errandId, status: PriceChangeStatus.REQUESTED },
    });
    if (open) {
      throw new ConflictException('A price change request is already pending for this task');
    }

    return this.requests.save(
      this.requests.create({
        errandId,
        requestedByUserId: actor.userId,
        fromPrice: errand.quotedPrice ?? errand.finalPrice ?? errand.budget ?? '0',
        toPrice: dto.toPrice.toFixed(2),
        reason: dto.reason ?? null,
        status: PriceChangeStatus.REQUESTED,
      }),
    );
  }

  /** Errand-owner customer (or admin) approves; price updates on the errand. */
  async approve(
    errandId: string,
    requestId: string,
    actor: { userId: string; role: UserRole },
  ): Promise<PriceChangeRequest> {
    const req = await this.pendingOwnedRequest(errandId, requestId, actor);
    await this.assertCustomer(errandId, actor);

    await this.errands.manager.transaction(async (manager) => {
      const errand = await manager
        .getRepository(Errand)
        .findOne({ where: { id: errandId }, lock: { mode: 'pessimistic_write' } });
      if (!errand) {
        throw new NotFoundException('Errand not found');
      }
      if (PRICE_CHANGEABLE.has(errand.status)) {
        if (
          errand.status === ErrandStatus.QUOTED ||
          errand.status === ErrandStatus.ACCEPTED
        ) {
          errand.quotedPrice = req.toPrice;
        } else {
          // Post-payment adjustments settle against the final price.
          errand.finalPrice = req.toPrice;
        }
        await manager.getRepository(Errand).save(errand);
      }
    });

    req.status = PriceChangeStatus.APPROVED;
    req.decidedByUserId = actor.userId;
    req.decidedAt = new Date();
    const saved = await this.requests.save(req);
    return saved;
  }

  /** Errand-owner customer (or admin) rejects — task is NOT cancelled. */
  async reject(
    errandId: string,
    requestId: string,
    actor: { userId: string; role: UserRole },
  ): Promise<PriceChangeRequest> {
    const req = await this.pendingOwnedRequest(errandId, requestId, actor);
    await this.assertCustomer(errandId, actor);

    req.status = PriceChangeStatus.REJECTED;
    req.decidedByUserId = actor.userId;
    req.decidedAt = new Date();
    const saved = await this.requests.save(req);
    return saved;
  }

  async pendingForErrand(errandId: string): Promise<PriceChangeRequest | null> {
    return this.requests.findOne({
      where: { errandId, status: PriceChangeStatus.REQUESTED },
    });
  }

  private async pendingOwnedRequest(
    errandId: string,
    requestId: string,
    actor: { userId: string; role: UserRole },
  ): Promise<PriceChangeRequest> {
    const req = await this.requests.findOne({
      where: { id: requestId, errandId, status: PriceChangeStatus.REQUESTED },
    });
    if (!req) {
      throw new NotFoundException('Pending price change request not found');
    }
    if (actor.role !== UserRole.ADMIN) {
      const ownerId = await this.errandService.getCustomerProfileId(actor.userId);
      const errand = await this.errands.findOne({ where: { id: errandId } });
      if (!errand || ownerId !== errand.customerId) {
        throw new ForbiddenException('Only the task owner can decide a price change');
      }
    }
    return req;
  }

  private async assertCustomer(
    errandId: string,
    actor: { userId: string; role: UserRole },
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) return;
    const ownerId = await this.errandService.getCustomerProfileId(actor.userId);
    const errand = await this.errands.findOne({ where: { id: errandId } });
    if (!errand || ownerId !== errand.customerId) {
      throw new ForbiddenException('Only the task owner can decide a price change');
    }
  }

  private async isAssignedRunner(
    errandId: string,
    userId: string,
  ): Promise<boolean> {
    const runner = await this.runners.findOne({ where: { userId } });
    if (!runner) return false;
    const assignment = await this.assignments.findOne({
      where: { errandId, runnerProfileId: runner.id },
    });
    return assignment !== null;
  }
}