import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { AssignmentDeclineReason, UserRole } from '../common/enums';
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
export class PurchaseLimitService {
  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
    private readonly ledger: RunnerPayoutsService,
  ) {}

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
   * The current runner declines because the required purchase is above their
   * limit. 409 `purchase_within_limit` when it is not (other declines are not
   * part of row 108); 409 `assignment_not_declinable` after RUNNER_ASSIGNED.
   */
  async decline(
    errandId: string,
    runnerUserId: string,
    reason: AssignmentDeclineReason,
  ): Promise<PurchaseCheck & { assignmentId: string; status: string; declineReason: AssignmentDeclineReason }> {
    let check: PurchaseCheck | null = null;
    const assignment = await this.errands.declineAssignment(errandId, runnerUserId, reason, async (manager, ctx) => {
      const runner = await this.runners.profileById(ctx.runnerProfileId);
      const required = await this.ledger.itemPaidToNitume(errandId, manager);
      check = {
        errandId,
        runnerProfileId: runner.id,
        requiredPurchase: required.toFixed(2),
        maxPurchaseAdvance: Number(runner.maxPurchaseAdvance).toFixed(2),
        overLimit: required > Number(runner.maxPurchaseAdvance),
      };
      if (!check.overLimit) {
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
