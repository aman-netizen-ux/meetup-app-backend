import type { LocationUpdate } from './entities/location_update.js';
import { CircleRuleError } from './circle_rule_error.js';

export class LocationUpdatePolicy {
  validate(update: LocationUpdate, now = new Date()): void {
    if (!Number.isFinite(update.latitude) || update.latitude < -90 || update.latitude > 90 ||
        !Number.isFinite(update.longitude) || update.longitude < -180 || update.longitude > 180 ||
        !Number.isFinite(update.accuracyMeters) || update.accuracyMeters < 0 ||
        update.accuracyMeters > 200) {
      throw new CircleRuleError('INVALID_LOCATION', 'A sufficiently accurate location is required.');
    }
    const age = now.getTime() - update.capturedAt.getTime();
    if (!Number.isFinite(update.capturedAt.getTime()) || age > 5 * 60_000 || age < -2 * 60_000) {
      throw new CircleRuleError('INVALID_LOCATION_TIME', 'The location timestamp is no longer valid.');
    }
  }
}
