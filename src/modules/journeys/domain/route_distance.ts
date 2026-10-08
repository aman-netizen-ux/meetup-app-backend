import type { RoutePoint } from './entities/route_point.js';

export class RouteDistance {
  metersBetween(a: RoutePoint, b: RoutePoint): number {
    const radians = Math.PI / 180;
    const lat1 = a.latitude * radians;
    const lat2 = b.latitude * radians;
    const deltaLat = (b.latitude - a.latitude) * radians;
    const deltaLon = (b.longitude - a.longitude) * radians;
    const value = Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }
}
