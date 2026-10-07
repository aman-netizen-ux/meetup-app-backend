import type { RouteOption } from '../domain/entities/route_option.js';

export function routeOptionJson(option: RouteOption): Record<string, unknown> {
  return {
    id: option.id,
    mode: option.mode,
    label: option.label,
    accuracyLabel: option.accuracyLabel,
    distanceMeters: option.distanceMeters,
    durationSeconds: option.durationSeconds,
    encodedPolyline: option.encodedPolyline,
    polylinePrecision: option.polylinePrecision,
    legs: option.legs,
    checkpoints: option.checkpoints,
    ...(option.expiresAt ? { expiresAt: option.expiresAt.toISOString() } : {}),
  };
}
