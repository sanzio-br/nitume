import { ForbiddenException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ApiError } from '../common/api-error';
import { AssignmentDeclineReason, RunnerAvailability, UserRole } from '../common/enums';
import { ErrandAssignment } from '../errands/errand-assignment.entity';
import { ErrandsService, ViewerContext } from '../errands/errands.service';
import { RunnerPayoutsService } from '../payments/runner-payouts.service';
import { RunnersService } from '../runners/runners.service';

/** A task's required out-of-pocket purchase against a runner's limit (row 108). */
export interface PurchaseCheck {
  errandId: string;
  runnerProfileId: string;
  /**
   * What the runner must buy with their own money and is later reimbursed
   * (send_to_runner: the item amount paid to Nitume). "0.00" on
   * merchant_direct (the customer pays the merchant) or without an item.
   */
  requiredPurchase: string;
  /** The runner's runner_profiles.max_purchase_advance. */
  maxPurchaseAdvance: string;
  /** True when requiredPurchase > maxPurchaseAdvance: the runner may decline. */
  overLimit: boolean;
}

/**
 * Row 108 (owner, 2026-10-13): "Runner out-of-pocket purchases are limited
 * by max_purchase_advance, and a runner may decline a task when the required
 * purchase exceeds their configured limit."
 */
@Injectable()
export class PurchaseLimitService implements OnModuleInit {
  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly ledger: RunnerPayoutsService,
  ) {}

  /**
   * Rows 113, 186 (owner, 2026-10-16): a runner whose max_purchase_advance
   * is below the task's required purchase cannot accept it and is not
   * offered it. There is no approved pre-accept exception record (the row
   * 142 exception is decided at reimbursement review), so the limit applies
   * as stored. Row 126: an unverified runner is not offered a task either.
   */
  onModuleInit(): void {
    this.errands.onRunnerAccept(async (manager, { errandId, runnerProfileId }) => {
      const check = await this.checkIn(manager, errandId, runnerProfileId);
      if (check.overLimit) {
        throw new ApiError(HttpStatus.CONFLICT, 'purchase_limit_exceeded', "This job's purchase is above your purchase limit", {
          requiredPurchase: check.requiredPurchase,
          maxPurchaseAdvance: check.maxPurchaseAdvance,
        });
      }
    });
    this.errands.onAssign(async (manager, { errandId, runnerProfileId }) => {
      const summary = await this.runners.verificationSummary(runnerProfileId, manager);
      if (!summary.verified) {
        throw new ApiError(HttpStatus.CONFLICT, 'runner_not_eligible', 'This runner is not verified yet', {
          reason: 'not_verified',
          runnerProfileId,
        });
      }
      // Row 187 (c): a runner on another accepted/active task is not eligible.
      const runner = await this.runners.profileById(runnerProfileId, manager);
      if (runner.availability === RunnerAvailability.BUSY) {
        throw new ApiError(HttpStatus.CONFLICT, 'runner_not_eligible', 'This runner is on another job', {
          reason: 'runner_busy',
          runnerProfileId,
        });
      }
      const check = await this.checkIn(manager, errandId, runnerProfileId);
      if (check.overLimit) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'runner_not_eligible',
          "The task's purchase is above this runner's purchase limit",
          {
            reason: 'over_purchase_limit',
            runnerProfileId,
            requiredPurchase: check.requiredPurchase,
            maxPurchaseAdvance: check.maxPurchaseAdvance,
          },
        );
      }
    });
  }

  /** The purchase check inside a transaction (no access check). */
  async checkIn(manager: EntityManager | undefined, errandId: string, runnerProfileId: string): Promise<PurchaseCheck> {
    const runner = await this.runners.profileById(runnerProfileId, manager);
    const required = await this.ledger.itemPaidToNitume(errandId, manager);
    return {
      errandId,
      runnerProfileId: runner.id,
      requiredPurchase: required.toFixed(2),
      maxPurchaseAdvance: Number(runner.maxPurchaseAdvance).toFixed(2),
      overLimit: required > Number(runner.maxPurchaseAdvance),
    };
  }

  /**
   * Runner on the current assignment: their own check. Admin: for
   * `runnerProfileId` (e.g. before assigning), else the current runner.
   */
  async check(errandId: string, viewer: ViewerContext, runnerProfileId?: string): Promise<PurchaseCheck> {
    await this.errands.getById(errandId, viewer);
    let profileId: string;
    if (viewer.role === UserRole.ADMIN) {
      const current: ErrandAssignment | null = runnerProfileId
        ? null
        : await this.errands.activeAssignmentFor(errandId);
      const id = runnerProfileId ?? current?.runnerProfileId;
      if (!id) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'runner_profile_required',
          'Give runnerProfileId: the task has no current runner',
        );
      }
      profileId = id;
    } else {
      profileId = (await this.runners.profileByUserId(viewer.userId)).id;
    }
    const runner = await this.runners.profileById(profileId);
    const required = await this.ledger.itemPaidToNitume(errandId);
    return {
      errandId,
      runnerProfileId: runner.id,
      requiredPurchase: required.toFixed(2),
      maxPurchaseAdvance: Number(runner.maxPurchaseAdvance).toFixed(2),
      overLimit: required > Number(runner.maxPurchaseAdvance),
    };
  }

  /**
   * The offered runner declines (rows 108, 113). With `over_purchase_limit`
   * the limit is checked (409 `purchase_within_limit` when the purchase is
   * within it); without a reason nothing is checked. Such declines are never
   * counted against the runner (no runner metric reads declines). 409
   * `assignment_not_declinable` after RUNNER_ASSIGNED, 409 `offer_expired`.
   */
  async decline(
    errandId: string,
    runnerUserId: string,
    reason: AssignmentDeclineReason | null,
  ): Promise<PurchaseCheck & { assignmentId: string; status: string; declineReason: AssignmentDeclineReason | null }> {
    let check: PurchaseCheck | null = null;
    const assignment = await this.errands.declineAssignment(errandId, runnerUserId, reason, async (manager, ctx) => {
      check = await this.checkIn(manager, errandId, ctx.runnerProfileId);
      if (reason === AssignmentDeclineReason.OVER_PURCHASE_LIMIT && !check.overLimit) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'purchase_within_limit',
          "This task's purchase is within your limit, so it can't be declined for that reason",
          { requiredPurchase: check.requiredPurchase, maxPurchaseAdvance: check.maxPurchaseAdvance },
        );
      }
    });
    if (!check) {
      throw new ForbiddenException('You are not assigned to this errand');
    }
    return {
      ...(check as PurchaseCheck),
      assignmentId: assignment.id,
      status: assignment.status,
      declineReason: reason,
    };
  }
}
