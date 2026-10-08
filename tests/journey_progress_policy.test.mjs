import assert from 'node:assert/strict';
import test from 'node:test';

import { JourneyProgressPolicy } from '../dist/src/modules/journeys/domain/journey_progress_policy.js';

const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

function route(mode, legs, checkpoints = []) {
  return {
    provider: 'test', mode, label: mode, accuracyLabel: 'test',
    distanceMeters: 1000, durationSeconds: 1200,
    encodedPolyline: encoded, polylinePrecision: 5, legs, checkpoints,
  };
}

test('journey progress advances legs and keeps leave-by private to timed circles', () => {
  const policy = new JourneyProgressPolicy();
  const target = new Date('2026-10-08T12:00:00Z');
  const transit = route('transit', [
    { mode: 'walk', label: 'Walk to stop', distanceMeters: 200, durationSeconds: 240 },
    { mode: 'transit', label: 'Take the bus', distanceMeters: 800, durationSeconds: 960 },
  ], [
    { latitude: 38.5, longitude: -120.2, label: 'Start walking', sequence: 0 },
    { latitude: 40.7, longitude: -120.95, label: 'Board bus', sequence: 1 },
  ]);

  const progress = policy.calculate(transit, {
    latitude: 40.7, longitude: -120.95, accuracyMeters: 10,
    capturedAt: new Date('2026-10-08T10:00:00Z'),
  }, target);
  assert.deepEqual(progress.currentLeg, { mode: 'transit', label: 'Take the bus' });
  assert.ok(progress.etaMinutes.min > 0);
  assert.ok(progress.etaMinutes.max > progress.etaMinutes.min);
  assert.equal(
    progress.leaveByAt.getTime(),
    target.getTime() - progress.etaMinutes.max * 60_000,
  );

  const untimed = policy.calculate(transit, {
    latitude: 40.7, longitude: -120.95, accuracyMeters: 10,
    capturedAt: new Date('2026-10-08T10:00:00Z'),
  }, null);
  assert.equal(untimed.leaveByAt, null);
});

test('uncertainty reflects road and estimated-transit limitations', () => {
  const policy = new JourneyProgressPolicy();
  const location = {
    latitude: 38.5, longitude: -120.2, accuracyMeters: 10,
    capturedAt: new Date('2026-10-08T10:00:00Z'),
  };
  const road = policy.calculate(route('road', [
    { mode: 'road', label: 'Drive', distanceMeters: 1000, durationSeconds: 1200 },
  ]), location, null);
  const transit = policy.calculate(route('transit', [
    { mode: 'transit', label: 'Estimated transit', distanceMeters: 1000, durationSeconds: 1200 },
  ]), location, null);

  assert.ok(road.etaMinutes.max > road.etaMinutes.min);
  assert.ok(transit.etaMinutes.max - transit.etaMinutes.min >=
    road.etaMinutes.max - road.etaMinutes.min);
});
