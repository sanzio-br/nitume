// Map geometry helpers (ports of google_tracking_map.dart routeFor / lerp).
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export function sameGeoPoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lat === b.lat && a.lng === b.lng;
}

export function lerpGeoPoint(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Dashed straight route (not a road route): `runner → routeTo` in the
 * runner "self" variant, otherwise `start (or runner) → end`.
 */
export function routeFor(opts: {
  start: GeoPoint | null;
  end: GeoPoint | null;
  runner: GeoPoint | null;
  routeTo: GeoPoint | null;
}): { from: GeoPoint; to: GeoPoint } | null {
  if (opts.routeTo) return opts.runner ? { from: opts.runner, to: opts.routeTo } : null;
  const from = opts.start ?? opts.runner;
  return from && opts.end ? { from, to: opts.end } : null;
}
