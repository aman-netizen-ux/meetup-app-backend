import type { PlaceSuggestion } from '../place_suggestion.js';

export interface PlaceSearchProvider {
  search(query: string): Promise<PlaceSuggestion[]>;
}
