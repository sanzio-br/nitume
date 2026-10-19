import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error';

/**
 * Ops-configured service areas (owner row 116: "Service areas are an
 * ops-configured list"). Until an admin screen exists (RA-24, no spec yet)
 * the list is server configuration: `RUNNER_SERVICE_AREAS`, a JSON array of
 * `{ id, name, lat, lng, radiusKm }`. `id` is a stable slug stored on
 * `runner_service_areas.area`; `name` is what people read.
 *
 * Task location -> area (proposed, owner to confirm): an area is a circle
 * (`lat`, `lng`, `radiusKm`); a task is inside an area when its first point
 * (task site, else pickup, else drop-off) is within the radius. Not used by
 * any decision yet: the matching pool (row 167) waits for its own batch.
 */
export interface ServiceArea {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

/** What clients read: `GET /runners/service-areas`, `GET /runners/me`. */
export interface ServiceAreaOption {
  id: string;
  name: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Parses `RUNNER_SERVICE_AREAS`. Empty or unset = no areas. Throws a plain
 * Error describing the first problem (used by env validation at start-up).
 */
export const parseServiceAreas = (raw: string | undefined | null): ServiceArea[] => {
  const text = (raw ?? '').trim();
  if (!text) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('RUNNER_SERVICE_AREAS must be a JSON array of { id, name, lat, lng, radiusKm }');
  }
  if (!Array.isArray(data)) {
    throw new Error('RUNNER_SERVICE_AREAS must be a JSON array of { id, name, lat, lng, radiusKm }');
  }
  const seen = new Set<string>();
  return data.map((item: unknown, i) => {
    const a = (item ?? {}) as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    const lat = Number(a.lat);
    const lng = Number(a.lng);
    const radiusKm = Number(a.radiusKm);
    if (!ID_PATTERN.test(id)) {
      throw new Error(`RUNNER_SERVICE_AREAS[${i}].id must be a lowercase slug (a-z, 0-9, _ or -, at most 64)`);
    }
    if (seen.has(id)) {
      throw new Error(`RUNNER_SERVICE_AREAS has the id '${id}' twice`);
    }
    seen.add(id);
    if (!name || name.length > 64) {
      throw new Error(`RUNNER_SERVICE_AREAS[${i}].name must be 1-64 characters`);
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`RUNNER_SERVICE_AREAS[${i}] needs a valid lat and lng`);
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 200) {
      throw new Error(`RUNNER_SERVICE_AREAS[${i}].radiusKm must be above 0 and at most 200`);
    }
    return { id, name, lat, lng, radiusKm };
  });
};

/** Options as clients see them, by name. */
export const serviceAreaOptionsOf = (areas: readonly ServiceArea[]): ServiceAreaOption[] =>
  [...areas].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }));

/**
 * The listed ids for `PUT /runners/me/service-areas`, de-duplicated in the
 * order given. 400 `service_area_unknown` (`unknown`: the ids not listed).
 */
export const listedAreaIds = (input: readonly string[], areas: readonly ServiceArea[]): string[] => {
  const known = new Set(areas.map((a) => a.id));
  const ids = [...new Set(input.map((v) => (typeof v === 'string' ? v.trim() : '')))].filter(Boolean);
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'service_area_unknown', 'Choose areas from the list', { unknown });
  }
  return ids;
};

const EARTH_RADIUS_KM = 6371.0088;

export const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Ids of the areas whose circle contains the point (proposed rule, see the file note). */
export const areasContaining = (point: { lat: number; lng: number }, areas: readonly ServiceArea[]): string[] =>
  areas.filter((a) => distanceKm(point, a) <= a.radiusKm).map((a) => a.id);
