// ND T11 (GooglePlaceSearch through a stubbed `google.maps.places`), the
// saved-address search and the PLACE_SEARCH factory (ND T9, T10, WQ-25).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAPS_API_KEY, MapsLoaderService } from '../map/maps-loader.service';
import { GooglePlaceSearch, PLACES_CACHE_CAP, PlacesLibrary } from './google-place-search';
import { PLACE_SEARCH, composeAddressText } from './place-search';
import { SavedPlaceSearch } from './saved-place-search';

class FakeToken {
  static made = 0;
  readonly n = FakeToken.made++;
}

interface FakePlaceData {
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat: () => number; lng: () => number } | null;
}

function fakePlaces(data: Record<string, FakePlaceData> = {}) {
  /** Every Place constructed (`new Place(options)`) and every toPlace() call. */
  const constructed: Record<string, unknown>[] = [];
  const toPlaceCalls: string[] = [];
  const places: { id: string; fields: string[]; via: 'toPlace' | 'constructor' }[] = [];
  class Place {
    id: string;
    displayName?: string | null;
    formattedAddress?: string | null;
    location?: FakePlaceData['location'];
    via: 'toPlace' | 'constructor' = 'constructor';
    constructor(options: Record<string, unknown>) {
      this.id = options['id'] as string;
      constructed.push(options);
    }
    async fetchFields(request: { fields: string[] }) {
      places.push({ id: this.id, fields: request.fields, via: this.via });
      Object.assign(this, data[this.id] ?? {});
      return { place: this };
    }
  }
  const prediction = (placeId: string, main: { text: string } | null, secondary: { text: string } | null, text: string) => ({
    placeId,
    text: { text },
    mainText: main,
    secondaryText: secondary,
    toPlace() {
      toPlaceCalls.push(placeId);
      const place = Object.create(Place.prototype) as Place;
      place.id = placeId;
      place.via = 'toPlace';
      return place;
    },
  });
  const fetchAutocompleteSuggestions = vi.fn(async (request: { input: string }) => ({
    suggestions: [
      { placePrediction: prediction(`pid-${request.input}`, { text: 'Sarit Centre' }, { text: 'Westlands, Nairobi' }, `${request.input} full`) },
      { placePrediction: prediction('pid-2', null, null, 'Only text') },
      { placePrediction: null },
    ],
  }));
  const library: PlacesLibrary = {
    AutocompleteSessionToken: FakeToken,
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    Place: Place as unknown as PlacesLibrary['Place'],
  };
  return { library, fetchAutocompleteSuggestions, places, constructed, toPlaceCalls };
}

const SARIT: FakePlaceData = {
  displayName: 'Sarit Centre',
  formattedAddress: 'Westlands, Nairobi',
  location: { lat: () => -1.2614, lng: () => 36.8027 },
};

describe('GooglePlaceSearch (ND T11)', () => {
  it('ND T11 request. includedRegionCodes [ke], language en and the session token object; maps mainText/secondaryText (fallback text)', async () => {
    const fake = fakePlaces();
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    const token = search.newSessionToken();
    const out = await search.autocomplete('Sarit', token);
    const request = fake.fetchAutocompleteSuggestions.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(request['input']).toBe('Sarit');
    expect(request['includedRegionCodes']).toEqual(['ke']);
    expect(request['language']).toBe('en');
    expect(request['sessionToken']).toBeInstanceOf(FakeToken);
    expect(out).toEqual([
      { placeId: 'pid-Sarit', primaryText: 'Sarit Centre', secondaryText: 'Westlands, Nairobi', source: 'google' },
      { placeId: 'pid-2', primaryText: 'Only text', secondaryText: null, source: 'google' },
    ]);
  });

  it('ND T11 details. toPlace() on the picked suggestion\'s placePrediction, then fetchFields with exactly id, displayName, formattedAddress, location; no sessionToken on a Place constructor', async () => {
    const fake = fakePlaces({ 'pid-Sarit': SARIT });
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    const token = search.newSessionToken();
    await search.autocomplete('Sarit', token);
    const details = await search.details('pid-Sarit', token);
    expect(fake.toPlaceCalls).toEqual(['pid-Sarit']);
    expect(fake.places).toEqual([{ id: 'pid-Sarit', fields: ['id', 'displayName', 'formattedAddress', 'location'], via: 'toPlace' }]);
    expect(fake.constructed).toEqual([]);
    expect(details).toEqual({ placeId: 'pid-Sarit', addressText: 'Sarit Centre, Westlands, Nairobi', lat: -1.2614, lng: 36.8027 });
  });

  it('ND T11 details fallback. with no prediction held for that session, new Place({ id }) without a sessionToken key', async () => {
    const fake = fakePlaces({ 'pid-x': SARIT });
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    await search.details('pid-x', search.newSessionToken());
    expect(fake.constructed).toEqual([{ id: 'pid-x' }]);
    expect(fake.constructed.some((o) => 'sessionToken' in o)).toBe(false);
  });

  it('ND T11 cache. same query twice in one session → one call; a new session → a new call; entry 201 clears the cache; Details drops its session', async () => {
    const fake = fakePlaces({ 'pid-Sarit': SARIT });
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    const a = search.newSessionToken();
    await search.autocomplete('Sarit', a);
    await search.autocomplete('  sarit ', a);
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    const b = search.newSessionToken();
    await search.autocomplete('Sarit', b);
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(2);
    // Fill to the cap (2 entries already), then entry 201 clears it.
    for (let i = 0; i < PLACES_CACHE_CAP - 2; i++) await search.autocomplete(`q${i}`, b);
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(PLACES_CACHE_CAP);
    await search.autocomplete('Sarit', a); // still cached (200 entries)
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(PLACES_CACHE_CAP);
    await search.autocomplete('entry-201', b); // clears, then stores
    await search.autocomplete('Sarit', a);
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(PLACES_CACHE_CAP + 2);
    await search.details('pid-Sarit', a);
    await search.autocomplete('Sarit', a); // the session's entries were dropped
    expect(fake.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(PLACES_CACHE_CAP + 3);
  });

  it('ND T11 composeAddressText. name + address; an address starting with the name is kept; empty name → address', () => {
    expect(composeAddressText('Sarit Centre', 'Westlands, Nairobi')).toBe('Sarit Centre, Westlands, Nairobi');
    expect(composeAddressText('Sarit Centre', 'Sarit Centre, Westlands')).toBe('Sarit Centre, Westlands');
    expect(composeAddressText('', 'Westlands, Nairobi')).toBe('Westlands, Nairobi');
    expect(composeAddressText(null, 'Westlands')).toBe('Westlands');
  });

  it('ND T11 no location. a place without a location rejects', async () => {
    const fake = fakePlaces({ p: { displayName: 'Nowhere', formattedAddress: 'Kenya', location: null } });
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    await expect(search.details('p', search.newSessionToken())).rejects.toThrow('This place has no map location.');
  });

  it('ND T11 library failure. importLibrary resolving null makes autocomplete and details reject', async () => {
    const search = new GooglePlaceSearch({ importLibrary: async () => null });
    await expect(search.autocomplete('Sarit', search.newSessionToken())).rejects.toThrow();
    await expect(search.details('p', search.newSessionToken())).rejects.toThrow();
  });

  it('ND T11 no Nitume header. searching and picking send nothing through HttpClient (no Google URL, no Authorization)', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fake = fakePlaces({ 'pid-Sarit': SARIT });
    const search = new GooglePlaceSearch({ importLibrary: async () => fake.library });
    const token = search.newSessionToken();
    await search.autocomplete('Sarit', token);
    await search.details('pid-Sarit', token);
    http.verify();
    expect(http.match(() => true)).toEqual([]);
  });
});

describe('SavedPlaceSearch and PLACE_SEARCH (WQ-25)', () => {
  const saved = [
    { id: 'a1', label: 'Office', addressText: 'Upper Hill, Nairobi', lat: -1.3, lon: 36.81 },
    { id: 'a2', label: 'Home', addressText: 'Kilimani, Nairobi', lat: -1.29, lon: 36.78 },
    { id: 'a3', label: 'Gym', addressText: 'No pin', lat: Number.NaN, lon: Number.NaN },
  ];

  it('ND T10 saved search. label or address contains (case-insensitive), only entries with lat/lon, ids saved:, placeId null, lng from lon', async () => {
    const search = new SavedPlaceSearch();
    search.useSavedAddresses(saved);
    expect(search.attributionRequired).toBe(false);
    expect(await search.autocomplete('Off', search.newSessionToken())).toEqual([
      { placeId: 'saved:a1', primaryText: 'Office', secondaryText: 'Upper Hill, Nairobi', source: 'saved' },
    ]);
    expect((await search.autocomplete('kilimani', '')).map((s) => s.primaryText)).toEqual(['Home']);
    expect(await search.autocomplete('gym', '')).toEqual([]);
    await expect(search.details('saved:a1', '')).resolves.toEqual({
      placeId: null,
      addressText: 'Upper Hill, Nairobi',
      lat: -1.3,
      lng: 36.81,
    });
  });

  it('ND T10 factory. no key → SavedPlaceSearch and importLibrary is never called; a key → GooglePlaceSearch', () => {
    TestBed.configureTestingModule({ providers: [{ provide: MAPS_API_KEY, useValue: '' }] });
    const importLibrary = vi.spyOn(MapsLoaderService.prototype, 'importLibrary');
    const search = TestBed.inject(PLACE_SEARCH);
    expect(search).toBeInstanceOf(SavedPlaceSearch);
    expect(importLibrary).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MAPS_API_KEY, useValue: 'test-key' }] });
    const google = TestBed.inject(PLACE_SEARCH);
    expect(google).toBeInstanceOf(GooglePlaceSearch);
    expect(google.attributionRequired).toBe(true);
    expect(importLibrary).not.toHaveBeenCalled(); // lazily, on the first search
    importLibrary.mockRestore();
  });
});
