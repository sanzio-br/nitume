import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../testing/css';
import { GeoPoint } from './geo';
import { NmLiveMap } from './live-map.component';
import { MAPS_API_KEY, MapsLoaderService } from './maps-loader.service';

// ---------------------------------------------------------------------------
// Fake google.maps namespace (spy Map, Marker, Polyline, LatLngBounds)
// ---------------------------------------------------------------------------

interface MarkerOptions {
  position: GeoPoint;
  icon: { url: string; anchor: FakePoint };
  zIndex: number;
  clickable: boolean;
}

class FakePoint {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

class FakeLatLngBounds {
  readonly points: GeoPoint[] = [];
  extend(p: GeoPoint): this {
    this.points.push(p);
    return this;
  }
}

/** What the "visible region" contains in a test. */
let visibleContains = true;

class FakeMap {
  static instances: FakeMap[] = [];
  readonly fitBounds = vi.fn();
  readonly setCenter = vi.fn();
  readonly setZoom = vi.fn();
  readonly setOptions = vi.fn();
  readonly addListener = vi.fn(() => ({ remove: () => undefined }));
  readonly getBounds = vi.fn(() => ({ contains: () => visibleContains }));
  constructor(
    readonly el: HTMLElement,
    readonly options: google.maps.MapOptions,
  ) {
    FakeMap.instances.push(this);
  }
}

class FakeMarker {
  static instances: FakeMarker[] = [];
  position: GeoPoint;
  readonly positions: GeoPoint[] = [];
  readonly setMap = vi.fn();
  constructor(readonly options: MarkerOptions) {
    this.position = options.position;
    FakeMarker.instances.push(this);
  }
  setPosition(p: GeoPoint): void {
    this.position = p;
    this.positions.push(p);
  }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  path: GeoPoint[];
  readonly setMap = vi.fn();
  constructor(readonly options: { path: GeoPoint[]; icons: { icon: { strokeColor: string } }[] }) {
    this.path = options.path;
    FakePolyline.instances.push(this);
  }
  setPath(p: GeoPoint[]): void {
    this.path = p;
  }
}

type Win = { google?: unknown };

function installGoogle(): void {
  FakeMap.instances = [];
  FakeMarker.instances = [];
  FakePolyline.instances = [];
  visibleContains = true;
  (window as unknown as Win).google = {
    maps: {
      Map: FakeMap,
      Marker: FakeMarker,
      Polyline: FakePolyline,
      LatLngBounds: FakeLatLngBounds,
      Point: FakePoint,
    },
  };
}

// ---------------------------------------------------------------------------

@Component({
  imports: [NmLiveMap],
  template: `
    <nm-live-map
      [start]="start()"
      [end]="end()"
      [runner]="runner()"
      [routeTo]="routeTo()"
      [etaLabel]="eta()"
      [height]="190"
      ariaLabel="Map of the task location"
    >
      <div nmMapOverlay class="nav-chip">Navigate</div>
    </nm-live-map>
  `,
})
class Host {
  readonly start = signal<GeoPoint | null>(null);
  readonly end = signal<GeoPoint | null>(null);
  readonly runner = signal<GeoPoint | null>(null);
  readonly routeTo = signal<GeoPoint | null>(null);
  readonly eta = signal<string | null>('ETA 12 min');
}

const A: GeoPoint = { lat: -1.3, lng: 36.8 };
const B: GeoPoint = { lat: -1.2, lng: 36.9 };
const START: GeoPoint = { lat: -1.28, lng: 36.81 };
const END: GeoPoint = { lat: -1.25, lng: 36.85 };

function setup(opts: { key?: string; google?: boolean; init?: (h: Host) => void } = {}) {
  if (opts.google !== false) installGoogle();
  TestBed.configureTestingModule({
    providers: [{ provide: MAPS_API_KEY, useValue: opts.key ?? 'test-browser-key' }],
  });
  const fixture = TestBed.createComponent(Host);
  opts.init?.(fixture.componentInstance);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const map = () => FakeMap.instances[0];
  const markers = () => FakeMarker.instances;
  const runnerMarker = () => FakeMarker.instances.find((m) => m.options.zIndex === 2);
  return { fixture, host, map, markers, runnerMarker, update: () => fixture.detectChanges() };
}

function stubReducedMotion(reduce: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduce : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

const FAKE = ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] as const;

describe('LiveMapComponent (§12.11)', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as Win).google;
    document.head.querySelectorAll('script[src*="maps.googleapis.com"]').forEach((s) => s.remove());
    document.documentElement.style.removeProperty('--nitume-green');
    document.documentElement.style.removeProperty('--nitume-blue');
    document.documentElement.style.removeProperty('--nitume-white');
  });

  it('59. the map is constructed exactly once; runner changes never re-create it or the start/end markers', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { host, map, markers, update } = setup({
      init: (h) => {
        h.start.set(START);
        h.end.set(END);
      },
    });
    expect(FakeMap.instances).toHaveLength(1);
    expect(map().options).toMatchObject({
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'cooperative',
      keyboardShortcuts: true,
    });
    expect(markers()).toHaveLength(2);
    for (const p of [A, B, A, B]) {
      host.runner.set(p);
      update();
      vi.advanceTimersByTime(1300);
    }
    host.eta.set('Arrived');
    update();
    expect(FakeMap.instances).toHaveLength(1);
    expect(markers()).toHaveLength(3); // start, end, one runner marker
    expect(markers().filter((m) => m.options.zIndex === 1)).toHaveLength(2);
    expect(markers().every((m) => m.options.clickable === false)).toBe(true);
    expect(map().setOptions).not.toHaveBeenCalled();
  });

  it('60. a new runner point glides through intermediate setPosition calls and ends exactly on it after moveDurationMs', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { host, runnerMarker, update } = setup({ init: (h) => h.runner.set(A) });
    const marker = runnerMarker()!;
    expect(marker.position).toEqual(A);
    host.runner.set(B);
    update();
    vi.advanceTimersByTime(600);
    const mid = marker.positions.at(-1)!;
    expect(mid.lat).toBeGreaterThan(A.lat);
    expect(mid.lat).toBeLessThan(B.lat);
    expect(mid.lng).toBeGreaterThan(A.lng);
    expect(mid.lng).toBeLessThan(B.lng);
    vi.advanceTimersByTime(700);
    expect(marker.positions.length).toBeGreaterThan(10);
    expect(marker.positions.at(-1)).toEqual(B);
    // Linear: positions move monotonically towards B.
    const lats = marker.positions.map((p) => p.lat);
    expect([...lats].sort((x, y) => x - y)).toEqual(lats);
    const calls = marker.positions.length;
    vi.advanceTimersByTime(2000);
    expect(marker.positions.length).toBe(calls); // animation finished
  });

  it('61. the first point is placed without a glide; null removes the marker at once and keeps nothing', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { host, runnerMarker, markers, update } = setup();
    expect(runnerMarker()).toBeUndefined();
    host.runner.set(A);
    update();
    const first = runnerMarker()!;
    expect(first.options.position).toEqual(A);
    expect(first.positions).toEqual([]); // placed, not animated

    host.runner.set(B);
    update();
    vi.advanceTimersByTime(300);
    host.runner.set(null);
    update();
    expect(first.setMap).toHaveBeenCalledWith(null);
    const count = first.positions.length;
    vi.advanceTimersByTime(2000);
    expect(first.positions.length).toBe(count); // glide stopped

    host.runner.set(A);
    update();
    const again = markers().at(-1)!;
    expect(again).not.toBe(first);
    expect(again.options.position).toEqual(A); // placed directly
    vi.advanceTimersByTime(2000);
    expect(again.positions).toEqual([]);
  });

  it('62. a new point mid-glide restarts from the current shown position', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { host, runnerMarker, update } = setup({ init: (h) => h.runner.set(A) });
    const marker = runnerMarker()!;
    host.runner.set(B);
    update();
    vi.advanceTimersByTime(600); // about halfway to B
    const shown = marker.positions.at(-1)!;
    const C: GeoPoint = { lat: -1.4, lng: 36.7 };
    host.runner.set(C);
    update();
    vi.advanceTimersByTime(17);
    const next = marker.positions.at(-1)!;
    // Continues from the shown point (not from A, not from B) towards C.
    expect(Math.abs(next.lat - shown.lat)).toBeLessThan(0.01);
    expect(next.lat).toBeLessThan(shown.lat);
    vi.advanceTimersByTime(1300);
    expect(marker.positions.at(-1)).toEqual(C);
  });

  it('63. camera: initial fit with padding 40; single point zoom 14; refit forced on start/end change; after a move only when outside the bounds', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    // Single point.
    let t = setup({ init: (h) => h.end.set(END) });
    expect(t.map().setCenter).toHaveBeenCalledWith(END);
    expect(t.map().setZoom).toHaveBeenCalledWith(14);
    expect(t.map().fitBounds).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    t = setup({
      init: (h) => {
        h.start.set(START);
        h.end.set(END);
      },
    });
    const map = t.map();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, padding] = map.fitBounds.mock.calls[0];
    expect(padding).toBe(40);
    expect((bounds as FakeLatLngBounds).points).toEqual([START, END]);

    // start/end change → forced refit.
    t.host.end.set(B);
    t.update();
    expect(map.fitBounds).toHaveBeenCalledTimes(2);

    // Runner appears inside the view → no refit; move ends inside → no refit.
    visibleContains = true;
    t.host.runner.set(A);
    t.update();
    t.host.runner.set({ lat: -1.29, lng: 36.82 });
    t.update();
    vi.advanceTimersByTime(1300);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);

    // Move ends outside the visible bounds → refit with every point.
    visibleContains = false;
    t.host.runner.set(A);
    t.update();
    expect(map.fitBounds).toHaveBeenCalledTimes(2); // not before the move completes
    vi.advanceTimersByTime(1300);
    expect(map.fitBounds).toHaveBeenCalledTimes(3);
    expect((map.fitBounds.mock.calls[2][0] as FakeLatLngBounds).points).toEqual([START, B, A]);
  });

  it('64. route: default start (or runner) → end; self variant runner → routeTo', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { host, update } = setup({
      init: (h) => {
        h.start.set(START);
        h.end.set(END);
      },
    });
    const line = () => FakePolyline.instances[0];
    expect(FakePolyline.instances).toHaveLength(1);
    expect(line().path).toEqual([START, END]);
    expect(line().options.icons[0].icon).toMatchObject({ strokeOpacity: 1, scale: 4 });

    host.start.set(null);
    host.runner.set(A);
    update();
    expect(line().path).toEqual([A, END]);

    host.routeTo.set(B);
    update();
    expect(line().path).toEqual([A, B]);
    // Follows the runner while it glides.
    host.runner.set(START);
    update();
    vi.advanceTimersByTime(1300);
    expect(line().path).toEqual([START, B]);
    expect(FakePolyline.instances).toHaveLength(1);

    host.runner.set(null);
    update();
    expect(line().setMap).toHaveBeenCalledWith(null);
  });

  it('65. ETA chip renders etaLabel in Fira Code and hides when null; the overlay slot renders', () => {
    const { fixture, host, update } = setup();
    const chip = () => fixture.nativeElement.querySelector('.nm-map__eta') as HTMLElement | null;
    expect(chip()!.textContent).toBe('ETA 12 min');
    const cs = getComputedStyle(chip()!);
    expect(cs.fontFamily).toBe('var(--nitume-font-num)');
    expect(cs.fontSize).toBe('11.5px');
    expect(cs.fontWeight).toBe('700');
    expect(cs.color).toBe('var(--nitume-blue)');
    expect(cs.backgroundColor).toBe('var(--nitume-white)');
    expect(cs.borderRadius).toBe('var(--nitume-r-pill)');
    expect(cs.top).toBe('14px');
    expect(cs.left).toBe('14px');
    expect(declared('.nm-map__eta', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    host.eta.set(null);
    update();
    expect(chip()).toBeNull();
    const overlay = fixture.nativeElement.querySelector('.nm-map__overlay .nav-chip') as HTMLElement;
    expect(overlay.textContent).toBe('Navigate');
    expect(getComputedStyle(overlay.parentElement!).bottom).toBe('12px');
    // Frame.
    const frame = fixture.nativeElement.querySelector('.nm-map') as HTMLElement;
    expect(frame.style.height).toBe('190px');
    expect(getComputedStyle(frame).borderRadius).toBe('var(--nitume-r-m)');
    expect(getComputedStyle(frame).overflow).toBe('hidden');
  });

  it('66. no key or loader unavailable → blue-050 placeholder with role="img" and the aria label; the script is never requested', async () => {
    const { fixture } = setup({ key: '', google: false });
    const loader = TestBed.inject(MapsLoaderService);
    expect(loader.ready()).toBe('unavailable');
    const frame = fixture.nativeElement.querySelector('.nm-map') as HTMLElement;
    expect(frame.getAttribute('role')).toBe('img');
    expect(frame.getAttribute('aria-label')).toBe('Map of the task location');
    expect(getComputedStyle(frame).backgroundColor).toBe('var(--nitume-blue-050)');
    expect(fixture.nativeElement.querySelector('google-map')).toBeNull();
    expect(fixture.nativeElement.querySelector('.nm-map__eta')?.textContent).toBe('ETA 12 min');
    expect(fixture.nativeElement.querySelector('.nav-chip')).not.toBeNull();
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    expect(frame.textContent).not.toMatch(/error|failed/i);
    TestBed.resetTestingModule();

    // Key present but the script fails to load → same placeholder.
    const failing = setup({ key: 'test-browser-key', google: false });
    const script = document.querySelector('script[src*="maps.googleapis.com"]') as HTMLScriptElement;
    expect(script.src).toContain('loading=async');
    expect(script.src).not.toContain('libraries=');
    script.dispatchEvent(new Event('error'));
    await TestBed.inject(MapsLoaderService).load();
    failing.update();
    const failed = failing.fixture.nativeElement.querySelector('.nm-map') as HTMLElement;
    expect(TestBed.inject(MapsLoaderService).ready()).toBe('unavailable');
    expect(failed.getAttribute('role')).toBe('img');
    expect(failing.fixture.nativeElement.querySelector('google-map')).toBeNull();
  });

  it('67. prefers-reduced-motion: reduce jumps to the new position without intermediate positions', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const restore = stubReducedMotion(true);
    try {
      const { host, runnerMarker, update } = setup({ init: (h) => h.runner.set(A) });
      const marker = runnerMarker()!;
      host.runner.set(B);
      update();
      expect(marker.positions).toEqual([B]);
      vi.advanceTimersByTime(2000);
      expect(marker.positions).toEqual([B]);
    } finally {
      restore();
    }
  });

  it('68. marker colours come from the CSS custom properties', () => {
    const root = document.documentElement.style;
    root.setProperty('--nitume-green', 'nm-test-green');
    root.setProperty('--nitume-blue', 'nm-test-blue');
    root.setProperty('--nitume-white', 'nm-test-white');
    const { markers } = setup({
      init: (h) => {
        h.start.set(START);
        h.end.set(END);
        h.runner.set(A);
      },
    });
    const svg = (m: FakeMarker) => decodeURIComponent(m.options.icon.url.split(',')[1]);
    const [start, end, runner] = markers();
    expect(start.options.icon.url.startsWith('data:image/svg+xml')).toBe(true);
    expect(svg(start)).toContain('fill="nm-test-blue"');
    expect(svg(end)).toContain('fill="nm-test-green"');
    expect(svg(runner)).toContain('fill="nm-test-green"');
    expect(svg(runner)).toContain('fill="nm-test-white"');
    expect(runner.options.icon.anchor).toEqual(new FakePoint(11, 11));
    expect(start.options.icon.anchor).toEqual(new FakePoint(10, 20));
    expect(FakePolyline.instances[0].options.icons[0].icon.strokeColor).toBe('nm-test-blue');
  });
});
