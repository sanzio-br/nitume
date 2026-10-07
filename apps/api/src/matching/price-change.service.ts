import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  ErrandStatus,
  PriceChangeStatus,
  StatusHistoryActor,
  UserRole,
} from '../common/enums';
import { ApiError } from '../common/api-error';
import { ErrandStateMachine, TransitionGuard } from '../errands/errand-state-machine';
import { Payment } from '../payments/payment.entity';
import { MerchantPaymentView, MerchantRoute } from '../payments/payment-views';
import { PaymentsService } from '../payments/payments.service';
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

/** Paid states: an approved increase becomes a difference payment record. */
const POST_PAYMENT = new Set<ErrandStatus>([
  ErrandStatus.PAYMENT_CONFIRMED,
  ErrandStatus.RUNNER_ASSIGNED,
  ErrandStatus.RUNNER_EN_ROUTE,
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
]);

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type PriceChangeDecision = PriceChangeRequest & {
  /** Set when an approved increase on a paid task was recorded. */
  differencePayment: {
    payment: Payment;
    merchantPayment: MerchantPaymentView | null;
  } | null;
};

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
    private readonly events: EventEmitter2,
    private readonly payments: PaymentsService,
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

    const saved = await this.requests.save(
      this.requests.create({
        errandId,
        requestedByUserId: actor.userId,
        // Price changes concern the merchant/item amount (errand budget).
        fromPrice: errand.budget ?? '0',
        toPrice: dto.toPrice.toFixed(2),
        reason: dto.reason ?? null,
        status: PriceChangeStatus.REQUESTED,
      }),
    );
    setImmediate(() => {
      this.events.emit('price_change.requested', {
        errandId,
        requestId: saved.id,
        fromPrice: saved.fromPrice,
        toPrice: saved.toPrice,
        reason: saved.reason,
        createdAt: saved.createdAt.toISOString(),
      });
    });
    return saved;
  }

  /**
   * Errand-owner customer (or admin) approves. A price change is about the
   * merchant/item amount only (owner decision Q8): the errand budget (the
   * merchant amount) moves to the new price; quoted/service price is not
   * touched. Once the customer has paid, an increase is recorded as a
   * difference payment linked to the request, on the same merchant route.
   */
  async approve(
    errandId: string,
    requestId: string,
    actor: { userId: string; role: UserRole },
    route?: MerchantRoute,
  ): Promise<PriceChangeDecision> {
    await this.pendingOwnedRequest(errandId, requestId, actor);
    await this.assertCustomer(errandId, actor);
    // One transaction: status check, difference record, budget and request.
    // Lock order errand -> request matches reject (transition, then request).
    return this.requests.manager.transaction(async (manager) => {
      const errand = await manager.getRepository(Errand).findOne({
        where: { id: errandId },
        lock: { mode: 'pessimistic_write' },
      });
      const req = await this.lockPending(manager, errandId, requestId);
      if (!errand || !PRICE_CHANGEABLE.has(errand.status)) {
        throw new ConflictException(
          `Price changes cannot be approved in status ${errand?.status ?? 'unknown'}`,
        );
      }
      const difference = round2(Number(req.toPrice) - Number(req.fromPrice));
      let differencePayment: PriceChangeDecision['differencePayment'] = null;
      if (difference > 0 && POST_PAYMENT.has(errand.status)) {
        // Validates the route before anything is written.
        differencePayment = await this.payments.recordPriceDifference(
          errandId,
          req.id,
          difference,
          route,
          manager,
        );
      }
      await manager.getRepository(Errand).update(errandId, { budget: req.toPrice });
      req.status = PriceChangeStatus.APPROVED;
      req.decidedByUserId = actor.userId;
      req.decidedAt = new Date();
      const saved = await manager.getRepository(PriceChangeRequest).save(req);
      return Object.assign(saved, { differencePayment });
    });
  }

  /**
   * Customer "Reject & cancel task": the request is rejected and the task is
   * CANCELLED in the same transaction (IN_PROGRESS uses the guarded
   * transition). A paid task then gets an admin refund review. An admin
   * rejection only rejects the request; the task continues.
   */
  async reject(
    errandId: string,
    requestId: string,
    actor: { userId: string; role: UserRole },
  ): Promise<PriceChangeDecision> {
    const req = await this.pendingOwnedRequest(errandId, requestId, actor);
    await this.assertCustomer(errandId, actor);
    // Re-read under a row lock so a concurrent approve/reject cannot also
    // decide the same request.
    const rejectWithin = async (manager: EntityManager) => {
      const row = await this.lockPending(manager, errandId, requestId);
      row.status = PriceChangeStatus.REJECTED;
      row.decidedByUserId = actor.userId;
      row.decidedAt = new Date();
      return manager.getRepository(PriceChangeRequest).save(row);
    };
    if (actor.role === UserRole.ADMIN) {
      const saved = await this.requests.manager.transaction(rejectWithin);
      return Object.assign(saved, { differencePayment: null });
    }
    const errand = await this.errands.findOne({ where: { id: errandId } });
    const status = errand?.status;
    const guard =
      status === ErrandStatus.IN_PROGRESS ? TransitionGuard.PRICE_CHANGE_REJECTION : undefined;
    if (
      !status ||
      !ErrandStateMachine.actorCanPerform(status, ErrandStatus.CANCELLED, StatusHistoryActor.CUSTOMER)
    ) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'price_change_reject_not_cancellable',
        `The task cannot be cancelled while it is ${status ?? 'unknown'}`,
      );
    }
    const { extra } = await this.errandService.transitionWith(
      errandId,
      ErrandStatus.CANCELLED,
      { type: StatusHistoryActor.CUSTOMER, id: actor.userId },
      `Price change rejected (${req.fromPrice} -> ${req.toPrice}); task cancelled`,
      { role: actor.role, userId: actor.userId },
      rejectWithin,
      guard,
    );
    return Object.assign(extra, { differencePayment: null });
  }

  /**
   * Price-change requests on an errand, newest first, for anyone allowed to
   * view the errand (owner customer, assigned runner, admin).
   */
  async listForErrand(
    errandId: string,
    viewer: { userId: string; role: UserRole },
    status?: PriceChangeStatus,
  ): Promise<PriceChangeRequest[]> {
    await this.errandService.getById(errandId, viewer);
    return this.requests.find({
      where: status ? { errandId, status } : { errandId },
      order: { createdAt: 'DESC' },
    });
  }

  async pendingForErrand(errandId: string): Promise<PriceChangeRequest | null> {
    return this.requests.findOne({
      where: { errandId, status: PriceChangeStatus.REQUESTED },
    });
  }

  /**
   * The request row under SELECT ... FOR UPDATE. A request decided by a
   * concurrent call (seen once its lock is released) is a 409.
   */
  private async lockPending(
    manager: EntityManager,
    errandId: string,
    requestId: string,
  ): Promise<PriceChangeRequest> {
    const row = await manager.getRepository(PriceChangeRequest).findOne({
      where: { id: requestId, errandId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      throw new NotFoundException('Pending price change request not found');
    }
    if (row.status !== PriceChangeStatus.REQUESTED) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'price_change_already_decided',
        `This price change request is already ${row.status}`,
      );
    }
    return row;
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