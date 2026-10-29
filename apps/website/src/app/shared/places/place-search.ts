// Place search (customer-v-new-details §Places; owner WQ-25, WQ-26). The
// browser calls Google Places through the Maps JavaScript API with the WQ-1
// key (Places API (New)): session tokens, a per-session cache, Kenya only;
// the field debounces 300 ms. Without a key, the customer's saved addresses
// are searched instead and no Maps script is requested. No API proxy and no
// Nitume token ever goes to Google. #12 `x-address-form` reuses this.
import { InjectionToken, Signal, inject } from '@angular/core';
import { MAPS_API_KEY, MapsLoaderService } from '../map/maps-loader.service';
import { GooglePlaceSearch } from './google-place-search';

export { composeAddressText } from './google-place-search';
import { SavedPlaceSearch } from './saved-place-search';

export interface PlaceSuggestion {
  readonly placeId: string;
  readonly primaryText: string;
  readonly secondaryText: string | null;
  readonly source: 'google' | 'saved';
}

export interface PlaceDetails {
  /** `null` for a saved address. */
  readonly placeId: string | null;
  readonly addressText: string;
  readonly lat: number;
  readonly lng: number;
}

/** A saved address with a map location (`GET /customers/me/addresses`). */
export interface SavedPlace {
  readonly id: string;
  readonly label: string;
  readonly addressText: string;
  readonly lat: number;
  readonly lon: number;
}

export interface PlaceSearch {
  /** True once the search can run (Google with a key; saved: always). */
  readonly available: Signal<boolean>;
  /** Google's attribution must sit under its suggestions (WQ-26). */
  readonly attributionRequired: boolean;
  /** One per search session; renewed after each successful pick. */
  newSessionToken(): unknown;
  autocomplete(query: string, sessionToken: unknown): Promise<PlaceSuggestion[]>;
  details(placeId: string, sessionToken: unknown): Promise<PlaceDetails>;
  /** The saved addresses the no-key search looks in (ignored by Google). */
  useSavedAddresses?(addresses: readonly SavedPlace[]): void;
}

/** Shown under a field when a search fails (Flutter `fieldError`). */
export const PLACE_SEARCH_FAILED = "Couldn't search places. Check your connection.";

/** Key configured → Google; no key → saved addresses (WQ-25). */
export const PLACE_SEARCH = new InjectionToken<PlaceSearch>('PLACE_SEARCH', {
  providedIn: 'root',
  factory: () => (inject(MAPS_API_KEY) ? new GooglePlaceSearch(inject(MapsLoaderService)) : new SavedPlaceSearch()),
});
