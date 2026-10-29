// GooglePlaceSearch (customer-v-new-details §Places, WQ-25): Places API
// (New) through the Maps JavaScript API, loaded by the kit MapsLoaderService
// (`importLibrary('places')`). Kenya only, English. Answers are cached per
// session token + normalised query (cap 200, then cleared; a session's
// entries go after its Details call). A library that fails to load makes
// every search reject, so the field shows the search-failure line.
import { signal } from '@angular/core';
import type { MapsLoaderService } from '../map/maps-loader.service';
import type { PlaceDetails, PlaceSearch, PlaceSuggestion } from './place-search';

/** The subset of `google.maps.places` used here (tests stub it). */
export interface PlacesLibrary {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      sessionToken: object;
      includedRegionCodes: string[];
      language: string;
    }): Promise<{ suggestions: GoogleSuggestion[] }>;
  };
  Place: new (options: { id: string; sessionToken?: object }) => GooglePlace;
}

interface GoogleSuggestion {
  placePrediction?: {
    placeId: string;
    text?: { text: string } | null;
    mainText?: { text: string } | null;
    secondaryText?: { text: string } | null;
  } | null;
}

interface GoogleLatLng {
  lat: number | (() => number);
  lng: number | (() => number);
}

interface GooglePlace {
  id?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: GoogleLatLng | null;
  fetchFields(request: { fields: string[] }): Promise<unknown>;
}

/** `"<name>, <address>"` unless the address already starts with the name; empty name → the address. */
export function composeAddressText(name: string | null | undefined, address: string | null | undefined): string {
  const n = (name ?? '').trim();
  const a = (address ?? '').trim();
  if (!n) return a;
  if (!a) return n;
  return a.startsWith(n) ? a : `${n}, ${a}`;
}

export const PLACE_DETAIL_FIELDS = ['id', 'displayName', 'formattedAddress', 'location'];
export const PLACES_CACHE_CAP = 200;

/** Opaque session key handed to the field; the Google token is made on first use. */
class SessionKey {
  constructor(readonly id: number) {}
}

const coordinate = (value: number | (() => number)): number => (typeof value === 'function' ? value() : value);

export class GooglePlaceSearch implements PlaceSearch {
  readonly available = signal(true).asReadonly();
  readonly attributionRequired = true;

  private library: Promise<PlacesLibrary | null> | null = null;
  private readonly tokens = new WeakMap<SessionKey, object>();
  private readonly cache = new Map<string, PlaceSuggestion[]>();
  private nextSession = 0;

  constructor(private readonly loader: Pick<MapsLoaderService, 'importLibrary'>) {}

  newSessionToken(): unknown {
    return new SessionKey(this.nextSession++);
  }

  async autocomplete(query: string, sessionToken: unknown): Promise<PlaceSuggestion[]> {
    const key = `${this.sessionId(sessionToken)}|${query.trim().toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const places = await this.places();
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: this.googleToken(sessionToken, places),
      includedRegionCodes: ['ke'],
      language: 'en',
    });
    const out: PlaceSuggestion[] = [];
    for (const s of suggestions ?? []) {
      const p = s.placePrediction;
      if (!p?.placeId) continue;
      out.push({
        placeId: p.placeId,
        primaryText: p.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.secondaryText?.text ?? null,
        source: 'google',
      });
    }
    if (this.cache.size >= PLACES_CACHE_CAP) this.cache.clear();
    this.cache.set(key, out);
    return out;
  }

  async details(placeId: string, sessionToken: unknown): Promise<PlaceDetails> {
    const places = await this.places();
    const place = new places.Place({ id: placeId, sessionToken: this.googleToken(sessionToken, places) });
    await place.fetchFields({ fields: [...PLACE_DETAIL_FIELDS] });
    this.dropSession(sessionToken);
    if (!place.location) throw new Error('This place has no map location.');
    return {
      placeId: place.id ?? placeId,
      addressText: composeAddressText(place.displayName, place.formattedAddress),
      lat: coordinate(place.location.lat),
      lng: coordinate(place.location.lng),
    };
  }

  private async places(): Promise<PlacesLibrary> {
    this.library ??= this.loader.importLibrary('places') as Promise<PlacesLibrary | null>;
    const places = await this.library;
    if (!places) throw new Error('Places library unavailable');
    return places;
  }

  private sessionId(token: unknown): number {
    return token instanceof SessionKey ? token.id : -1;
  }

  private googleToken(token: unknown, places: PlacesLibrary): object {
    if (!(token instanceof SessionKey)) return new places.AutocompleteSessionToken();
    let real = this.tokens.get(token);
    if (!real) {
      real = new places.AutocompleteSessionToken();
      this.tokens.set(token, real);
    }
    return real;
  }

  private dropSession(token: unknown): void {
    const prefix = `${this.sessionId(token)}|`;
    for (const key of [...this.cache.keys()]) if (key.startsWith(prefix)) this.cache.delete(key);
  }
}
