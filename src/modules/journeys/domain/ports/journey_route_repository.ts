import type { RouteCandidate } from '../entities/route_candidate.js';
import type { RouteOption } from '../entities/route_option.js';

export interface SelectedRouteResult {
  option: RouteOption;
  circleRevision: number;
}

export interface JourneyRouteRepository {
  replaceOptions(
    circleId: string,
    userId: string,
    candidates: RouteCandidate[],
    expiresAt: Date,
  ): Promise<RouteOption[]>;
  selectOption(circleId: string, userId: string, optionId: string): Promise<SelectedRouteResult | null>;
  findSelected(circleId: string, userId: string): Promise<RouteOption | null>;
}
