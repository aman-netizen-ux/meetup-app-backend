import type { RouteCandidate } from './route_candidate.js';

export interface RouteOption extends RouteCandidate {
  id: string;
  expiresAt: Date | null;
}
