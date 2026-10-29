import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RunnerAvailability } from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import {
  PresenceRecord,
  RunnerPresenceService,
  WEB_AUTO_OFFLINE_EVENT,
  WebAutoOfflineEvent,
  silentSince,
} from '../runners/runner-presence.service';
import { RunnersService } from '../runners/runners.service';

export const DEFAULT_WEB_STALE_SECONDS = 90;
export const DEFAULT_WEB_OFFLINE_SECONDS = 300;

export interface WebPresenceSweepResult {
  /** Runners flagged to ops in this run (`runner:web_pings_stopped`). */
  flagged: string[];
  /** Idle web runners set offline in this run (`runner:web_auto_offline`). */
  offlined: string[];
}

/**
 * Issue #36 (owner Q14-5, Q14-6, Q14-7, 2026-10-29), run by the maintenance
 * queue (non-negotiable §7: never on a request path). Composed from the
 * owning modules' services: RunnersService pages through the runners who
 * are `online` or `busy`, RunnerPresenceService holds the Redis presence,
 * ErrandsService says whether a runner holds an open offer.
 *
 * For each runner whose presence client is `web` (app runners are never
 * touched), silent since the latest of their last ping, last socket
 * connect and last switch to online:
 *  - silent > `location.webStaleSeconds` (90) and not yet flagged -> flag
 *    once (`runner:web_pings_stopped` to admins). Covers a web runner who
 *    connected or went online and never pinged.
 *  - `online` (not `busy`) and silent > `location.webOfflineSeconds` (300)
 *    -> set offline through RunnersService's availability path
 *    (`runner:web_auto_offline` to admins). A `busy` runner (on an active
 *    job) is flagged only. A runner holding an open offer is flagged only
 *    until the offer is accepted, declined or lapses (no task, assignment or
 *    offer is ever touched here).
 *
 * The server cannot tell a closed or hidden tab from a revoked location
 * permission (Q14-7): all three are "no ping", and the same rule applies.
 */
@Injectable()
export class WebPresenceSweepService {
  private readonly logger = new Logger(WebPresenceSweepService.name);

  constructor(
    private readonly runners: RunnersService,
    private readonly errands: ErrandsService,
    private readonly presence: RunnerPresenceService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  staleSeconds(): number {
    return this.seconds('location.webStaleSeconds', DEFAULT_WEB_STALE_SECONDS);
  }

  offlineSeconds(): number {
    return this.seconds('location.webOfflineSeconds', DEFAULT_WEB_OFFLINE_SECONDS);
  }

  /**
   * One pass over the online and busy runners. A failure on one runner is
   * logged and the pass goes on; a failed page read stops the pass (the
   * next run retries).
   */
  async sweep(now: Date = new Date(), batch = 500, maxPages = 200): Promise<WebPresenceSweepResult> {
    const staleMs = this.staleSeconds() * 1000;
    const offlineMs = this.offlineSeconds() * 1000;
    const out: WebPresenceSweepResult = { flagged: [], offlined: [] };
    let after: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const runners = await this.runners.activeRunnersPage(after, batch);
      if (runners.length === 0) {
        break;
      }
      after = runners[runners.length - 1].id;
      const records = await this.presence.recordsOf(runners.map((r) => r.id));
      for (const [i, runner] of runners.entries()) {
        const record = records[i];
        if (!record || record.client !== 'web') {
          continue;
        }
        const silentMs = now.getTime() - silentSince(record);
        try {
          if (silentMs > staleMs && record.webPingsStoppedAt === null) {
            if (await this.presence.markStopped(runner.id, new Date(now.getTime() - staleMs), now)) {
              out.flagged.push(runner.id);
            }
          }
          if (runner.availability === RunnerAvailability.ONLINE && silentMs > offlineMs) {
            if (await this.setOffline(runner.id, record, now, offlineMs)) {
              out.offlined.push(runner.id);
            }
          }
        } catch (err) {
          this.logger.warn(`Web presence of ${runner.id} not swept: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (runners.length < batch) {
        break;
      }
    }
    if (out.flagged.length > 0 || out.offlined.length > 0) {
      this.logger.log(`Web presence: flagged ${out.flagged.length}, set offline ${out.offlined.length}`);
    }
    return out;
  }

  /** Q14-6: re-checked inside the profile lock (still web, still silent, still no open offer). */
  private async setOffline(runnerProfileId: string, record: PresenceRecord, now: Date, offlineMs: number): Promise<boolean> {
    if (await this.hasOpenOffer(runnerProfileId, now)) {
      return false;
    }
    const done = await this.runners.setOfflineBySystem(runnerProfileId, async () => {
      const fresh = await this.presence.recordOf(runnerProfileId);
      if (!fresh || fresh.client !== 'web' || now.getTime() - silentSince(fresh) <= offlineMs) {
        return false;
      }
      return !(await this.hasOpenOffer(runnerProfileId, now));
    });
    if (done) {
      this.events?.emit(WEB_AUTO_OFFLINE_EVENT, {
        runnerProfileId,
        lastPingAt: record.lastPingAt === null ? null : new Date(record.lastPingAt).toISOString(),
        at: now.toISOString(),
      } satisfies WebAutoOfflineEvent);
    }
    return done;
  }

  private async hasOpenOffer(runnerProfileId: string, now: Date): Promise<boolean> {
    return (await this.errands.openOffersFor(runnerProfileId, { limit: 1, now })).items.length > 0;
  }

  private seconds(key: string, fallback: number): number {
    const v = Number(this.config?.get<number>(key, fallback) ?? fallback);
    return Number.isFinite(v) && v >= 1 ? v : fallback;
  }
}
