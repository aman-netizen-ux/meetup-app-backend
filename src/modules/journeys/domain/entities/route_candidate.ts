import type { JourneyMode } from './journey_mode.js';
import type { RouteCheckpoint } from './route_checkpoint.js';
import type { RouteLeg } from './route_leg.js';

export interface RouteCandidate {
  provider: string;
  mode: JourneyMode;
  label: string;
  accuracyLabel: string;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string | null;
  polylinePrecision: number | null;
  legs: RouteLeg[];
  checkpoints: RouteCheckpoint[];
}
