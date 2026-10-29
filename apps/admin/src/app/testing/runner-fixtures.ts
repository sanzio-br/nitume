import { HttpTestingController } from '@angular/common/http/testing';
import type { RunnerListItem, RunnerPresence } from '../core/api-types';
import { API, flushAsync } from './admin-test-utils';

export const RUNNER_ID = 'rrrrrrrr-0000-0000-0000-000000004f2a';
/** `shortId(RUNNER_ID)`. */
export const RUNNER_SHORT = '#NT-04F2A';

/** 2:01 PM and 2:03 PM East Africa Time on 29 Oct 2026. */
export const PING_AT = '2026-10-29T11:01:00.000Z';
export const STOP_AT = '2026-10-29T11:03:00.000Z';
export const OFFLINE_AT = '2026-10-29T11:06:00.000Z';

export function runnerFixture(
  patch: Partial<RunnerListItem> = {},
  presence?: Partial<RunnerPresence> | null,
): RunnerListItem {
  return {
    id: RUNNER_ID,
    userId: 'uuuuuuuu-0000-0000-0000-000000004f2a',
    verificationLevel: '2_id_verified',
    availability: 'online',
    avgRating: '4.8',
    errandsCompleted: 12,
    trustScore: '88',
    completionRate: '96',
    skillsCount: 3,
    lastPingAt: null,
    createdAt: '2026-09-01T06:00:00Z',
    ...(presence === null
      ? {}
      : {
          presence: {
            client: 'web',
            lastPingAt: PING_AT,
            webPingsStoppedAt: null,
            ...presence,
          },
        }),
    ...patch,
  };
}

/** Answers the requests of `AdminDataService.refresh()` with these runners. */
export async function flushRefresh(
  http: HttpTestingController,
  runners: RunnerListItem[],
): Promise<void> {
  http
    .expectOne((r) => r.url === `${API}/errands` && !r.params.has('quoteRequested'))
    .flush({
      items: [],
      nextCursor: null,
    });
  http.expectOne((r) => r.url === `${API}/runners`).flush({ items: runners, nextCursor: null });
  http.expectOne(`${API}/users/me`).flush({ id: 'admin-1', firstName: 'Wanjiru' });
  await flushAsync();
  http
    .match(() => true)
    .forEach((r) =>
      r.flush(r.request.url.includes('/count') ? { count: 0 } : { items: [], nextCursor: null }),
    );
  await flushAsync();
}
