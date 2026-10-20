import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandStatus, StatusHistoryActor } from '../common/enums';
import { ErrandsService } from '../errands/errands.service';
import { GEOFENCE_ARRIVAL_JOB, LOCATION_PERSIST_JOB, LOCATION_QUEUE } from '../infra/queue/queues';
import { RunnersService } from '../runners/runners.service';
import type { GeofenceArrivalJob, LocationPersistJob } from './location-ingest.service';

/** History note of a geofenced arrival (§4.3); `v-active` shows `GPS confirmed` for a system ARRIVED. */
export const GEOFENCE_ARRIVAL_NOTE = 'Geofence arrival';

/**
 * Location queue worker (§4.2, §4.3, §9): writes go through the owning
 * module's service (runners for positions, errands for the transition).
 */
@Processor(LOCATION_QUEUE)
export class LocationProcessor extends WorkerHost {
  private readonly logger = new Logger(LocationProcessor.name);

  constructor(
    private readonly runners: RunnersService,
    private readonly errands: ErrandsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case LOCATION_PERSIST_JOB:
        return this.persist(job.data as LocationPersistJob);
      case GEOFENCE_ARRIVAL_JOB:
        return this.arrive(job.data as GeofenceArrivalJob);
      default:
        this.logger.warn(`Unknown location job ${job.name}`);
        return null;
    }
  }

  async persist(data: LocationPersistJob): Promise<{ moved: boolean }> {
    const moved = await this.runners.recordPing({
      runnerProfileId: data.runnerProfileId,
      errandId: data.errandId,
      lat: data.lat,
      lng: data.lng,
      capturedAt: new Date(data.capturedAt),
      trail: data.trail,
    });
    return { moved };
  }

  /**
   * RUNNER_EN_ROUTE -> ARRIVED by the system (§3.3 "runner / system
   * (geofence)"). Skipped when the task moved on (the runner tapped
   * `I've arrived`, or it ended) or the runner no longer holds the job.
   */
  async arrive(data: GeofenceArrivalJob): Promise<{ arrived: boolean }> {
    const holder = await this.errands.activeAssignmentFor(data.errandId);
    if (holder?.status !== AssignmentStatus.ACCEPTED || holder.runnerProfileId !== data.runnerProfileId) {
      return { arrived: false };
    }
    try {
      await this.errands.transition(data.errandId, ErrandStatus.ARRIVED, { type: StatusHistoryActor.SYSTEM }, GEOFENCE_ARRIVAL_NOTE);
      return { arrived: true };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'illegal_transition') {
        return { arrived: false };
      }
      throw err;
    }
  }
}
