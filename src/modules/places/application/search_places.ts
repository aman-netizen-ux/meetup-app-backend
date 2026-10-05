import type { PlaceSuggestion } from '../domain/place_suggestion.js';
import type { PlaceSearchProvider } from '../domain/ports/place_search_provider.js';

export class SearchPlaces {
  constructor(private readonly provider: PlaceSearchProvider) {}

  private readonly cache = new Map<string, { expiresAt: number; items: PlaceSuggestion[] }>();
  private static readonly cacheDurationMs = 5 * 60 * 1000;
  private static readonly maxCacheEntries = 500;

  async execute(query: string): Promise<PlaceSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3 || trimmed.length > 100) return [];
    const key = trimmed.toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.items;
    const items = await this.provider.search(trimmed);
    if (this.cache.size >= SearchPlaces.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { items, expiresAt: Date.now() + SearchPlaces.cacheDurationMs });
    return items;
  }
}
