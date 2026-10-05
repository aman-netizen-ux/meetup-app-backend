import { find } from 'geo-tz';
import type { TimeZoneResolver } from '../domain/ports/time_zone_resolver.js';

export class GeoTimeZoneResolver implements TimeZoneResolver {
  resolve(latitude: number, longitude: number): string {
    return find(latitude, longitude)[0];
  }
}
