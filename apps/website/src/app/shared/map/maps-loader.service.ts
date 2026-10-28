// MapsLoaderService (ui-kit spec §7.5). Loads the Maps JavaScript API once
// per page with the configured browser key. No key → `unavailable`, and no
// request is ever made (WQ-1: the key is still with the owner).
import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type MapsLoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

/** Browser key from environment config (empty in git). */
export const MAPS_API_KEY = new InjectionToken<string>('MAPS_API_KEY', {
  providedIn: 'root',
  factory: () => environment.mapsApiKey,
});

const MAPS_SCRIPT_URL = 'https://maps.googleapis.com/maps/api/js';
const READY_CALLBACK = '__nmMapsLoaderReady';

interface MapsWindow {
  google?: { maps?: { Map?: unknown; importLibrary?: (name: string) => Promise<unknown> } };
  [READY_CALLBACK]?: () => void;
}

@Injectable({ providedIn: 'root' })
export class MapsLoaderService {
  private readonly key = inject(MAPS_API_KEY);
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<MapsLoadState>('idle');
  private pending: Promise<boolean> | null = null;

  readonly ready = this.state.asReadonly();

  /** Resolves true when `google.maps` is usable. Safe to call repeatedly. */
  load(): Promise<boolean> {
    if (this.pending) return this.pending;
    if (!this.key) {
      this.state.set('unavailable');
      this.pending = Promise.resolve(false);
      return this.pending;
    }
    const win = (this.document.defaultView ?? {}) as MapsWindow;
    if (win.google?.maps?.Map) {
      this.state.set('ready');
      this.pending = Promise.resolve(true);
      return this.pending;
    }
    this.state.set('loading');
    this.pending = new Promise<boolean>((resolve) => {
      const fail = () => {
        this.state.set('unavailable');
        resolve(false);
      };
      win[READY_CALLBACK] = () => {
        const maps = win.google?.maps;
        Promise.all([maps?.importLibrary?.('maps'), maps?.importLibrary?.('marker')])
          .then(() => {
            this.state.set('ready');
            resolve(true);
          })
          .catch(fail);
      };
      const script = this.document.createElement('script');
      script.src =
        `${MAPS_SCRIPT_URL}?key=${encodeURIComponent(this.key)}` +
        `&loading=async&callback=${READY_CALLBACK}`;
      script.async = true;
      script.onerror = fail;
      this.document.head.appendChild(script);
    });
    return this.pending;
  }

  /** Auth failure reported by the map (bad or restricted key). */
  markUnavailable(): void {
    this.state.set('unavailable');
  }
}
