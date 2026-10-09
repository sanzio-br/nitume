import { Injectable } from '@nestjs/common';
import { ErrandPointType, ErrandStatus } from '../common/enums';
import { ErrandsService, ViewerContext } from '../errands/errands.service';
import {
  RunnerPublicSummary,
  RunnersService,
} from '../runners/runners.service';

/** States in which the assigned runner's position is shared with viewers. */
export const LIVE_TRACKING_STATUSES = new Set<ErrandStatus>([
  ErrandStatus.RUNNER_ASSIGNED,
  ErrandStatus.RUNNER_EN_ROUTE,
  ErrandStatus.ARRIVED,
  ErrandStatus.IN_PROGRESS,
  ErrandStatus.AWAITING_CUSTOMER,
]);

export interface TrackingPoint {
  pointType: ErrandPointType;
  lat: number;
  lng: number;
  addressText: string;
}

export interface TrackingSnapshot {
  errandId: string;
  status: ErrandStatus;
  /** True while the runner position is shared (see LIVE_TRACKING_STATUSES). */
  live: boolean;
  points: TrackingPoint[];
  runner: RunnerPublicSummary | null;
  /** Last-known runner position; null outside live states or before a ping. */
  runnerLocation: { lat: number; lng: number; capturedAt: Date | null } | null;
  /** Seconds to arrival. Always null until ETA (Distance Matrix) is wired. */
  eta: number | null;
}

/**
 * Initial tracking snapshot for `GET /errands/:id/tracking` (§3.2). Live
 * updates then arrive over Socket.IO `location:update` (§4.2).
 */
@Injectable()
export class LocationService {
  constructor(
    private readonly errands: ErrandsService,
    private readonly runners: RunnersService,
  ) {}

  async trackingFor(errandId: string, viewer: ViewerContext): Promise<TrackingSnapshot> {
    const errand = await this.errands.getDetail(errandId, viewer);
    const locations = await this.errands.locationsFor(errandId);
    const live = LIVE_TRACKING_STATUSES.has(errand.status);
    const runnerId = errand.assignment?.runner?.id ?? null;
    const runnerLocation =
      live && runnerId ? await this.runners.lastKnownLocation(runnerId) : null;

    return {
      errandId: errand.id,
      status: errand.status,
      live,
      points: locations.map((l) => ({
        pointType: l.pointType,
        lat: l.coordinates.coordinates[1],
        lng: l.coordinates.coordinates[0],
        addressText: l.addressText,
      })),
      runner: errand.assignment?.runner ?? null,
      runnerLocation,
      eta: null,
    };
  }
}
