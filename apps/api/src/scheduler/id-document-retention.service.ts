import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DisputesService } from '../disputes/disputes.service';
import { RunnersService } from '../runners/runners.service';

/**
 * Daily ID/selfie purge (rows 154, 161, 170, 175), composed from the owning
 * modules' services (review minor 5: no cross-module SQL in RunnersService):
 * RunnersService finds the decided images past the retention clock (never a
 * pending verification); DisputesService holds back every runner with an
 * open or under-review dispute; RunnersService then deletes the rest.
 */
@Injectable()
export class IdDocumentRetentionService {
  constructor(
    private readonly runners: RunnersService,
    private readonly disputes: DisputesService,
  ) {}

  /**
   * Pages through the due images, excluding held runners inside the query
   * (reviewer minor 2: the hold applies before the page LIMIT, so held rows
   * never crowd out purgeable ones), and re-checks the hold inside each
   * purge transaction (minor 3). `onlyRunnerProfileIds` narrows the run (ops
   * tooling and tests); the daily job passes nothing.
   */
  async purgeExpired(now: Date = new Date(), batch = 200, onlyRunnerProfileIds?: string[], maxPages = 20): Promise<string[]> {
    const held = new Set<string>();
    const skipped = new Set<string>();
    const purged: string[] = [];
    const isHeld = async (runnerProfileId: string, manager: EntityManager) =>
      (await this.disputes.runnersWithOpenDisputes([runnerProfileId], manager)).has(runnerProfileId);
    for (let page = 0; page < maxPages; page += 1) {
      const due = await this.runners.documentsDueForPurge(now, batch, {
        onlyRunnerProfileIds,
        excludeRunnerProfileIds: [...held],
        excludeIds: [...skipped],
      });
      if (due.length === 0) {
        break;
      }
      for (const runner of await this.disputes.runnersWithOpenDisputes(due.map((d) => d.runnerProfileId))) {
        held.add(runner);
      }
      const ids = due.filter((d) => !held.has(d.runnerProfileId)).map((d) => d.id);
      const done = await this.runners.purgeDocuments(ids, now, isHeld);
      purged.push(...done);
      // Not purged this time (storage error, restarted clock, new hold): skip until tomorrow.
      for (const id of ids) {
        if (!done.includes(id)) {
          skipped.add(id);
        }
      }
    }
    return purged;
  }
}
