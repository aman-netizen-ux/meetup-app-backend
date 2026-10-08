import type { JourneyMode } from './journey_mode.js';

export interface JourneyProgress {
  currentLeg: { mode: JourneyMode; label: string } | null;
  etaMinutes: { min: number; max: number } | null;
  leaveByAt: Date | null;
}
