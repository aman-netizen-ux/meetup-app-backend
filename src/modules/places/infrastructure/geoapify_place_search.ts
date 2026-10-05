import type { PlaceSuggestion } from '../domain/place_suggestion.js';
import type { PlaceSearchProvider } from '../domain/ports/place_search_provider.js';

interface GeoapifyResult {
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
}

export class GeoapifyPlaceSearch implements PlaceSearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<PlaceSuggestion[]> {
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    url.search = new URLSearchParams({ text: query, format: 'json', limit: '6', apiKey: this.apiKey }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Place search failed with status ${response.status}`);
    const data = await response.json() as { results?: GeoapifyResult[] };
    return (data.results ?? [])
      .filter((item) => typeof item.lat === 'number' && typeof item.lon === 'number')
      .map((item) => ({
        label: item.address_line1 || item.formatted || query,
        secondaryLabel: item.address_line2 || item.formatted || '',
        latitude: item.lat!, longitude: item.lon!, placeId: item.place_id ?? null,
      }));
  }
}
