import type { RoutePoint } from './entities/route_point.js';

export class PolylineDecoder {
  decode(encoded: string | null, precision: number | null): RoutePoint[] {
    if (!encoded || precision === null) return [];
    const factor = 10 ** precision;
    const points: RoutePoint[] = [];
    let index = 0;
    let latitude = 0;
    let longitude = 0;
    while (index < encoded.length) {
      const lat = this.decodeCoordinate(encoded, index);
      index = lat.next;
      if (index > encoded.length) break;
      const lon = this.decodeCoordinate(encoded, index);
      index = lon.next;
      latitude += lat.delta;
      longitude += lon.delta;
      points.push({ latitude: latitude / factor, longitude: longitude / factor });
    }
    return points;
  }

  private decodeCoordinate(encoded: string, start: number): { delta: number; next: number } {
    let result = 0;
    let shift = 0;
    let index = start;
    let byte = 0;
    do {
      if (index >= encoded.length) return { delta: 0, next: encoded.length + 1 };
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return {
      delta: (result & 1) !== 0 ? ~(result >> 1) : result >> 1,
      next: index,
    };
  }
}
