import type { RouteCandidate } from '../entities/route_candidate.js';
import type { RoutePoint } from '../entities/route_point.js';

export interface RoutingProvider {
  suggest(origin: RoutePoint, destination: RoutePoint): Promise<RouteCandidate[]>;
}
