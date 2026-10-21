import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RUNNER_LEVEL_DROPPED_EVENT, RunnerLevelDroppedEvent } from '../runners/runners.service';
import { ErrandsService } from './errands.service';

/**
 * Row 266 (owner, 2026-10-21): when a runner drops below Level 2 (rows 263,
 * 265), their open offers are withdrawn. Accepted and in-progress jobs
 * continue. New offers and assignments are already refused by the shared
 * verification rule (pool, admin assign `runner_not_eligible`
 * {reason: not_verified}, accept `runner_not_verified`). Never throws: the
 * level change has committed; a failure is logged and the offers then lapse
 * through the usual expiry (and cannot be accepted meanwhile). Awaited by
 * the emitter (`emitAsync`), so the withdrawal has run when the request
 * that dropped the level answers.
 */
@Injectable()
export class RunnerLevelWatcher {
  private readonly logger = new Logger(RunnerLevelWatcher.name);

  constructor(private readonly errands: ErrandsService) {}

  @OnEvent(RUNNER_LEVEL_DROPPED_EVENT)
  async onLevelDropped(event: RunnerLevelDroppedEvent): Promise<void> {
    try {
      const ids = await this.errands.withdrawOpenOffersOf(event.runnerProfileId);
      if (ids.length > 0) {
        this.logger.log(`Runner ${event.runnerProfileId} dropped to ${event.to}: withdrew offers on ${ids.join(', ')}`);
      }
    } catch (err) {
      this.logger.error(
        `Could not withdraw open offers of runner ${event.runnerProfileId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
