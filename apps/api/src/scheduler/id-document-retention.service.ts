import { Injectable } from '@nestjs/common';
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

  /** `onlyRunnerProfileIds` narrows the run (ops tooling and tests); the daily job passes nothing. */
  async purgeExpired(now: Date = new Date(), batch = 200, onlyRunnerProfileIds?: string[]): Promise<string[]> {
    const due = await this.runners.documentsDueForPurge(now, batch, onlyRunnerProfileIds);
    if (due.length === 0) {
      return [];
    }
    const held = await this.disputes.runnersWithOpenDisputes(due.map((d) => d.runnerProfileId));
    return this.runners.purgeDocuments(
      due.filter((d) => !held.has(d.runnerProfileId)).map((d) => d.id),
      now,
    );
  }
}
