import type { JourneyMode } from './journey_mode.js';

export interface RouteLeg {
  mode: JourneyMode;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
}
