// `nm-live-map` / LiveMapComponent (ui-kit spec §7; Flutter LiveTrackingMap
// + GoogleTrackingMap C-31, JobRouteMap R-16).
//
// The google.maps.Map is created ONCE (through <google-map>). Inputs never
// re-create it: markers and the route are updated in place, and the runner
// marker glides with requestAnimationFrame (`marker.setPosition` only).
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { NmNum } from '../format/num.directive';
import { GeoPoint, lerpGeoPoint, routeFor, sameGeoPoint } from './geo';
import { MapsLoaderService } from './maps-loader.service';

/** Map created once with these options (web: no controls, cooperative gestures). */
const BASE_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  clickableIcons: false,
  gestureHandling: 'cooperative',
  keyboardShortcuts: true,
  zoom: 14,
};

/** Nairobi CBD, until the first point arrives (Flutter default). */
const DEFAULT_CENTER: GeoPoint = { lat: -1.2864, lng: 36.8172 };
const SINGLE_POINT_ZOOM = 14;

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Mockup `.pin`: 14px square, three rounded corners, turned −45°, tip down. */
function pinSvg(fill: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
    `<g transform="rotate(-45 10 10)"><path transform="translate(3 3)" ` +
    `d="M0 14V7a7 7 0 0 1 7-7a7 7 0 0 1 7 7a7 7 0 0 1-7 7Z" fill="${fill}"/></g></svg>`
  );
}

/** 16px dot with a 3px ring. */
function runnerSvg(fill: string, ring: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
    `<circle cx="11" cy="11" r="11" fill="${ring}"/><circle cx="11" cy="11" r="8" fill="${fill}"/></svg>`
  );
}

@Component({
  selector: 'nm-live-map',
  imports: [GoogleMap, NmNum],
  templateUrl: './live-map.component.html',
  styleUrl: './live-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmLiveMap {
  /** Blue pin (runner start / pickup). */
  readonly start = input<GeoPoint | null>(null);
  /** Green pin (task site / drop-off). */
  readonly end = input<GeoPoint | null>(null);
  /** Live runner dot; null outside the location window (removed at once). */
  readonly runner = input<GeoPoint | null>(null);
  /** Runner "self" variant: the line runs runner → routeTo. */
  readonly routeTo = input<GeoPoint | null>(null);
  readonly etaLabel = input<string | null>(null);
  readonly height = input(220);
  readonly ariaLabel = input('Map of the task location');
  readonly moveDurationMs = input(1200);
  readonly fitPadding = input(40);

  private readonly loader = inject(MapsLoaderService);
  private readonly authFailed = signal(false);
  protected readonly showMap = computed(() => this.loader.ready() === 'ready' && !this.authFailed());

  /** Options are fixed for the component's life (center from the first point). */
  protected readonly mapOptions: google.maps.MapOptions;

  private map: google.maps.Map | null = null;
  private startMarker: google.maps.Marker | null = null;
  private endMarker: google.maps.Marker | null = null;
  private runnerMarker: google.maps.Marker | null = null;
  private route: google.maps.Polyline | null = null;

  private synced = false;
  private fittedOnce = false;
  private prevStart: GeoPoint | null = null;
  private prevEnd: GeoPoint | null = null;
  private prevRunner: GeoPoint | null = null;

  /** Runner position currently drawn (mid-glide value while animating). */
  private shown: GeoPoint | null = null;
  private glideFrom: GeoPoint | null = null;
  private glideTo: GeoPoint | null = null;
  private glideStart = 0;
  private frame: number | null = null;

  constructor() {
    void this.loader.load();
    const first = this.start() ?? this.end() ?? this.runner() ?? DEFAULT_CENTER;
    this.mapOptions = { ...BASE_OPTIONS, center: first };

    effect(() => {
      // Track every geometry input; diffing happens in sync().
      this.start();
      this.end();
      this.runner();
      this.routeTo();
      untracked(() => this.sync());
    });

    inject(DestroyRef).onDestroy(() => {
      this.cancelGlide();
      for (const m of [this.startMarker, this.endMarker, this.runnerMarker]) m?.setMap(null);
      this.route?.setMap(null);
    });
  }

  protected onMapReady(map: google.maps.Map): void {
    this.map = map;
    this.sync();
  }

  protected onAuthFailure(): void {
    this.authFailed.set(true);
    this.loader.markUnavailable();
  }

  // -------------------------------------------------------------------------

  private sync(): void {
    const map = this.map;
    if (!map) return;
    const start = this.start();
    const end = this.end();
    const runner = this.runner();
    const first = !this.synced;

    const startChanged = first || !sameGeoPoint(start, this.prevStart);
    const endChanged = first || !sameGeoPoint(end, this.prevEnd);
    if (startChanged) this.startMarker = this.placePin(this.startMarker, start, '--nitume-blue');
    if (endChanged) this.endMarker = this.placePin(this.endMarker, end, '--nitume-green');

    this.synced = true;
    this.prevStart = start;
    this.prevEnd = end;

    if (first || !sameGeoPoint(runner, this.prevRunner)) {
      this.prevRunner = runner;
      this.moveRunner(runner);
    }
    this.updateRoute();

    if (first) this.fit(true);
    else if (startChanged || endChanged) this.fit(true);
  }

  private moveRunner(next: GeoPoint | null): void {
    if (next === null) {
      // Outside the location window: remove at once, keep nothing.
      this.cancelGlide();
      this.shown = null;
      this.runnerMarker?.setMap(null);
      this.runnerMarker = null;
      return;
    }
    if (this.shown === null) {
      // First point: placed directly, no glide.
      this.shown = next;
      this.drawRunner(next);
      this.fit(!this.fittedOnce);
      return;
    }
    if (this.reducedMotion()) {
      this.cancelGlide();
      this.shown = next;
      this.drawRunner(next);
      this.updateRoute();
      this.fit(false);
      return;
    }
    // Glide from where the marker is drawn now (restarts mid-glide).
    this.cancelGlide();
    this.glideFrom = this.shown;
    this.glideTo = next;
    this.glideStart = performance.now();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    this.frame = null;
    const from = this.glideFrom;
    const to = this.glideTo;
    if (!from || !to) return;
    const duration = Math.max(1, this.moveDurationMs());
    const t = Math.min(1, (performance.now() - this.glideStart) / duration);
    this.shown = t >= 1 ? to : lerpGeoPoint(from, to, t);
    this.drawRunner(this.shown);
    this.updateRoute();
    if (t < 1) {
      this.frame = requestAnimationFrame(() => this.tick());
    } else {
      this.glideFrom = null;
      this.glideTo = null;
      this.fit(false);
    }
  }

  private cancelGlide(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.glideFrom = null;
    this.glideTo = null;
  }

  private drawRunner(point: GeoPoint): void {
    if (this.runnerMarker) {
      this.runnerMarker.setPosition(point);
      return;
    }
    this.runnerMarker = new google.maps.Marker({
      map: this.map,
      position: point,
      clickable: false,
      zIndex: 2,
      icon: {
        url: svgUrl(runnerSvg(cssToken('--nitume-green'), cssToken('--nitume-white'))),
        anchor: new google.maps.Point(11, 11),
      },
    });
  }

  private placePin(
    marker: google.maps.Marker | null,
    point: GeoPoint | null,
    colourToken: '--nitume-blue' | '--nitume-green',
  ): google.maps.Marker | null {
    if (point === null) {
      marker?.setMap(null);
      return null;
    }
    if (marker) {
      marker.setPosition(point);
      return marker;
    }
    return new google.maps.Marker({
      map: this.map,
      position: point,
      clickable: false,
      zIndex: 1,
      icon: {
        url: svgUrl(pinSvg(cssToken(colourToken))),
        anchor: new google.maps.Point(10, 20),
      },
    });
  }

  private updateRoute(): void {
    const route = routeFor({
      start: this.start(),
      end: this.end(),
      runner: this.shown,
      routeTo: this.routeTo(),
    });
    if (!route) {
      this.route?.setMap(null);
      this.route = null;
      return;
    }
    const path = [route.from, route.to];
    if (this.route) {
      this.route.setPath(path);
      return;
    }
    // 8px dashes, 6px gaps, via a repeated line symbol.
    this.route = new google.maps.Polyline({
      map: this.map,
      path,
      clickable: false,
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeColor: cssToken('--nitume-blue'),
            strokeOpacity: 1,
            strokeWeight: 3,
            scale: 4,
          },
          offset: '0',
          repeat: '14px',
        },
      ],
    });
  }

  /** Fit all present points; single point → zoom 14. Not forced: only when the runner left the view. */
  private fit(force: boolean): void {
    const map = this.map;
    if (!map) return;
    const runner = this.shown;
    if (!force && runner) {
      const visible = map.getBounds();
      if (visible && visible.contains(runner)) return;
    }
    const points = [this.start(), this.end(), runner].filter((p): p is GeoPoint => p !== null);
    if (points.length === 0) return;
    this.fittedOnce = true;
    if (points.every((p) => sameGeoPoint(p, points[0]))) {
      map.setCenter(points[0]);
      map.setZoom(SINGLE_POINT_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, this.fitPadding());
  }

  private reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
