import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { AuthContext, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssignmentDeclineReason, UserRole } from '../common/enums';
import { DeclineOfferDto, ListOffersQueryDto } from './dto/matching.dto';
import { RunnerJobsService } from './runner-jobs.service';

const DECLINE_REASONS: readonly string[] = Object.values(AssignmentDeclineReason);

/**
 * Runner offers and jobs (RA-1, RA-2, RA-3, RA-8; rows 113, 137, 185, 186).
 * Runner role only.
 */
@Controller()
@Roles(UserRole.RUNNER)
export class RunnerJobsController {
  constructor(private readonly jobs: RunnerJobsService) {}

  /**
   * Open offers, newest first: `{ items: RunnerJobView[], nextCursor }`
   * (`?limit` 1-50, default 20; `?cursor` opaque). Offers past their
   * `offerExpiresAt` or past the task's `deadlineAt` are not listed.
   * 403 runner_not_verified.
   */
  @Get('runners/me/offers')
  offers(@CurrentUser() user: AuthContext, @Query() query: ListOffersQueryDto) {
    return this.jobs.offers(user.userId, { limit: query.limit, cursor: query.cursor ?? null });
  }

  /** The runner projection of an offered or held job (`RunnerJobView`). 403 when not the runner's. */
  @Get('runners/me/jobs/:errandId')
  job(@CurrentUser() user: AuthContext, @Param('errandId', ParseUUIDPipe) errandId: string) {
    return this.jobs.job(user.userId, errandId);
  }

  /**
   * Accept the offer = RUNNER_ASSIGNED -> RUNNER_EN_ROUTE (row 113), the
   * same transition as `PATCH /errands/:id/status { to: RUNNER_EN_ROUTE }`.
   * 200 `{ job: RunnerJobView, history }`. Errors: 403 not the offered
   * runner; 403 runner_not_verified (`verification`); 409 offer_expired
   * (`offerExpiresAt`; `reason: task_deadline_passed` + `deadlineAt` when
   * the task's deadline has passed, row 185); 409 runner_offline;
   * 409 runner_busy; 409 purchase_limit_exceeded (`requiredPurchase`,
   * `maxPurchaseAdvance`); 409 illegal_transition (not RUNNER_ASSIGNED).
   */
  @Post('errands/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.accept(user.userId, id);
  }

  /**
   * Decline the offer `{ reason?: 'over_purchase_limit' }` (rows 113, 134):
   * the task stays RUNNER_ASSIGNED for another runner; this runner is not
   * offered it again (row 178). 200 `{ errandId, runnerProfileId,
   * requiredPurchase, maxPurchaseAdvance, overLimit, assignmentId, status:
   * 'declined', declineReason }`. Errors: 400 decline_reason_invalid
   * (`allowed`); 403 not the offered runner; 409 offer_expired; 409
   * assignment_not_declinable; 409 purchase_within_limit (reason sent while
   * within the limit).
   */
  @Post('errands/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineOfferDto) {
    const reason = dto.reason ?? null;
    if (reason !== null && !DECLINE_REASONS.includes(reason)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'decline_reason_invalid', 'Unknown decline reason', {
        allowed: DECLINE_REASONS,
      });
    }
    return this.jobs.decline(user.userId, id, reason as AssignmentDeclineReason | null);
  }
}
