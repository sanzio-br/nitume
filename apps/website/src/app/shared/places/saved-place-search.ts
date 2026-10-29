// SavedPlaceSearch (customer-v-new-details §Places): the no-key fallback.
// Label or address contains the query (case-insensitive), only addresses
// with a map location, ids prefixed `saved:`. No network.
import { signal } from '@angular/core';
import type { PlaceDetails, PlaceSearch, PlaceSuggestion, SavedPlace } from './place-search';

const PREFIX = 'saved:';

export class SavedPlaceSearch implements PlaceSearch {
  readonly available = signal(true).asReadonly();
  readonly attributionRequired = false;
  private addresses: readonly SavedPlace[] = [];

  useSavedAddresses(addresses: readonly SavedPlace[]): void {
    this.addresses = addresses.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  }

  newSessionToken(): unknown {
    return `saved-${Math.random().toString(36).slice(2)}`;
  }

  async autocomplete(query: string, _sessionToken?: unknown): Promise<PlaceSuggestion[]> {
    const q = query.trim().toLowerCase();
    return this.addresses
      .filter((a) => !q || a.label.toLowerCase().includes(q) || a.addressText.toLowerCase().includes(q))
      .map((a) => ({ placeId: `${PREFIX}${a.id}`, primaryText: a.label, secondaryText: a.addressText, source: 'saved' as const }));
  }

  async details(placeId: string, _sessionToken?: unknown): Promise<PlaceDetails> {
    const found = this.addresses.find((a) => `${PREFIX}${a.id}` === placeId);
    if (!found) throw new Error('Unknown saved address');
    return { placeId: null, addressText: found.addressText, lat: found.lat, lng: found.lon };
  }
}
