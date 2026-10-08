import type { LocationUpdate } from '../../circles/domain/entities/location_update.js';
import type { JourneyMode } from './entities/journey_mode.js';
import type { JourneyProgress } from './entities/journey_progress.js';
import type { RouteCandidate } from './entities/route_candidate.js';
import type { RoutePoint } from './entities/route_point.js';
import { PolylineDecoder } from './polyline_decoder.js';
import { RouteDistance } from './route_distance.js';

export class JourneyProgressPolicy {
  constructor(
    private readonly decoder = new PolylineDecoder(),
    private readonly distance = new RouteDistance(),
  ) {}

  calculate(
    route: RouteCandidate,
    location: LocationUpdate,
    targetAt: Date | null,
  ): JourneyProgress {
    const points = this.decoder.decode(route.encodedPolyline, route.polylinePrecision);
    if (points.length < 2 || route.durationSeconds <= 0) {
      return { currentLeg: route.legs[0] ?? null, etaMinutes: null, leaveByAt: null };
    }
    const current = { latitude: location.latitude, longitude: location.longitude };
    const nearestIndex = this.nearestIndex(points, current);
    const totalMeters = this.pathMeters(points, 0);
    const remainingMeters = this.pathMeters(points, nearestIndex) +
      this.distance.metersBetween(current, points[nearestIndex]);
    const remainingRatio = Math.min(1.5, remainingMeters / Math.max(1, totalMeters));
    const baselineMinutes = Math.max(1, Math.ceil(route.durationSeconds * remainingRatio / 60));
    const leg = this.currentLeg(route, points, nearestIndex);
    const range = this.range(baselineMinutes, leg?.mode ?? route.mode);
    return {
      currentLeg: leg,
      etaMinutes: range,
      leaveByAt: targetAt
        ? new Date(targetAt.getTime() - range.max * 60_000)
        : null,
    };
  }

  private nearestIndex(points: RoutePoint[], location: RoutePoint): number {
    let nearest = 0;
    let meters = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index++) {
      const candidate = this.distance.metersBetween(points[index], location);
      if (candidate < meters) {
        nearest = index;
        meters = candidate;
      }
    }
    return nearest;
  }

  private pathMeters(points: RoutePoint[], start: number): number {
    let meters = 0;
    for (let index = start; index < points.length - 1; index++) {
      meters += this.distance.metersBetween(points[index], points[index + 1]);
    }
    return meters;
  }

  private currentLeg(
    route: RouteCandidate,
    points: RoutePoint[],
    nearestIndex: number,
  ): { mode: JourneyMode; label: string } | null {
    if (route.legs.length === 0) return null;
    let legIndex = 0;
    for (const checkpoint of route.checkpoints) {
      const checkpointIndex = this.nearestIndex(points, checkpoint);
      if (checkpointIndex <= nearestIndex) legIndex = checkpoint.sequence;
    }
    const leg = route.legs[Math.min(legIndex, route.legs.length - 1)];
    return { mode: leg.mode, label: leg.label };
  }

  private range(minutes: number, mode: JourneyMode): { min: number; max: number } {
    const factors = mode === 'walk' ? [0.9, 1.2]
      : mode === 'road' ? [0.85, 1.35]
      : [0.8, 1.4];
    return {
      min: Math.max(1, Math.floor(minutes * factors[0])),
      max: Math.max(1, Math.ceil(minutes * factors[1])),
    };
  }
}
