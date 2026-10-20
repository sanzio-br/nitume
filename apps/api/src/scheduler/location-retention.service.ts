import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisputesService } from '../disputes/disputes.service';
import { ErrandsService } from '../errands/errands.service';
import { RunnersService } from '../runners/runners.service';

/** Row 247 (owner, 2026-10-20): job location samples are kept 90 days after the task ends. */
export const DEFAULT_LOCATION_RETENTION_DAYS = 90;

/**
 * Daily purge of job location samples (`runner_locations`, row 247),
 * composed from the owning modules' services (no cross-module SQL):
 * RunnersService pages through the tasks that have samples, ErrandsService
 * keeps those that ended (terminal state) more than `location.retentionDays`
 * ago, DisputesService holds back any with an open or under-review dispute,
 * and RunnersService deletes the samples of the rest.
 */
@Injectable()
export class LocationRetentionService {
  constructor(
    private readonly runners: RunnersService,
    private readonly errands: ErrandsService,
    private readonly disputes: DisputesService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  retentionDays(): number {
    const value = Number(this.config?.get<number>('location.retentionDays', DEFAULT_LOCATION_RETENTION_DAYS));
    return Number.isFinite(value) && value >= 1 ? value : DEFAULT_LOCATION_RETENTION_DAYS;
  }

  /** Returns the tasks whose samples were deleted and how many rows went. */
  async purgeExpired(now: Date = new Date(), batch = 500, maxPages = 200): Promise<{ errandIds: string[]; deleted: number }> {
    const cutoff = new Date(now.getTime() - this.retentionDays() * 86_400_000);
    const purged: string[] = [];
    let deleted = 0;
    let after: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const ids = await this.runners.errandsWithLocationSamples(after, batch);
      if (ids.length === 0) {
        break;
      }
      after = ids[ids.length - 1];
      const ended = await this.errands.endedBefore(ids, cutoff);
      const held = await this.disputes.errandsWithOpenDisputes(ended);
      const due = ended.filter((id) => !held.has(id));
      deleted += await this.runners.deleteLocationSamples(due);
      purged.push(...due);
      if (ids.length < batch) {
        break;
      }
    }
    return { errandIds: purged, deleted };
  }
}
