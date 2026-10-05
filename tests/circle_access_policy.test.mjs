import assert from 'node:assert/strict';
import test from 'node:test';

import { CircleAccessPolicy } from '../dist/src/modules/circles/domain/circle_access_policy.js';

const policy = new CircleAccessPolicy();
const circle = {
  id: 'circle-1',
  organizerId: 'user-1',
  destination: { latitude: 12.9, longitude: 77.6, label: 'Meetup' },
  isPrivatePlace: true,
  meetupDate: null,
  meetupTime: null,
  timeZone: 'Asia/Kolkata',
  state: 'active',
};
const member = {
  circleId: 'circle-1',
  userId: 'user-2',
  isOrganizer: false,
  travelRole: 'mover',
  setupStatus: 'ready',
  arrivedAt: null,
};

test('location requires an active, ready mover who has consented and not arrived', () => {
  assert.equal(policy.canIngestLocation(circle, member, true), true);
  assert.equal(policy.canIngestLocation(circle, member, false), false);
  assert.equal(policy.canIngestLocation({ ...circle, state: 'scheduled' }, member, true), false);
  assert.equal(policy.canIngestLocation({ ...circle, state: 'ended' }, member, true), false);
  assert.equal(policy.canIngestLocation(circle, { ...member, travelRole: 'anchor' }, true), false);
  assert.equal(policy.canIngestLocation(circle, { ...member, circleId: 'other' }, true), false);
  assert.equal(policy.canIngestLocation(circle, { ...member, arrivedAt: new Date() }, true), false);
});

test('anchor is offered only for a private-place circle that has not ended', () => {
  assert.equal(policy.canChooseAnchor(circle), true);
  assert.equal(policy.canChooseAnchor({ ...circle, isPrivatePlace: false }), false);
  assert.equal(policy.canChooseAnchor({ ...circle, state: 'ended' }), false);
});
