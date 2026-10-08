import assert from 'node:assert/strict';
import test from 'node:test';
import { CircleNotificationPolicy } from '../dist/src/modules/notifications/domain/circle_notification_policy.js';

function circle(member, revision = 1) {
  return {
    id: 'circle-1', organizerId: 'organizer', destination: { label: 'Park', latitude: 1, longitude: 1, placeId: null },
    isPrivatePlace: false, meetupDate: null, meetupTime: null, timeZone: 'Asia/Kolkata',
    state: 'active', endReason: null, revision, viewerSetupStatus: 'ready',
    members: [member, {
      circleId: 'circle-1', userId: 'other', displayName: 'Other', isOrganizer: false,
      travelRole: 'mover', setupStatus: 'ready', presence: 'live', arrivedAt: null,
      pin: null, lastUpdatedAt: null, currentLeg: null, etaMinutes: null,
    }],
  };
}

const baseMember = {
  circleId: 'circle-1', userId: 'member', displayName: 'Meera', isOrganizer: true,
  travelRole: 'mover', setupStatus: 'ready', presence: 'live', arrivedAt: null,
  pin: null, lastUpdatedAt: null, currentLeg: { mode: 'walk', label: 'Walk' }, etaMinutes: { min: 10, max: 12 },
};

test('only meaningful ETA changes become push candidates', () => {
  const policy = new CircleNotificationPolicy();
  const minor = circle({ ...baseMember, etaMinutes: { min: 12, max: 14 } }, 2);
  assert.equal(policy.notifications(circle(baseMember), minor).length, 0);
  const meaningful = circle({ ...baseMember, etaMinutes: { min: 16, max: 20 } }, 3);
  assert.equal(policy.notifications(circle(baseMember), meaningful)[0].title, 'Journey update');
});

test('arrival is sent to ready circle members other than the arriving member', () => {
  const policy = new CircleNotificationPolicy();
  const arrived = circle({ ...baseMember, presence: 'here', arrivedAt: new Date('2026-10-09T12:00:00Z') }, 2);
  const notification = policy.notifications(circle(baseMember), arrived)[0];
  assert.equal(notification.body, 'Meera has arrived.');
  assert.deepEqual(notification.recipientUserIds, ['other']);
});
