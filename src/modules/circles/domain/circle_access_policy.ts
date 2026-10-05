import type { Circle } from './entities/circle.js';
import type { CircleMembership } from './entities/circle_membership.js';

/** Pure product rules; HTTP routes and SQL never decide these independently. */
export class CircleAccessPolicy {
  canIngestLocation(
    circle: Circle,
    member: CircleMembership,
    hasLocationConsent: boolean,
  ): boolean {
    return circle.state === 'active' &&
      member.circleId === circle.id &&
      member.travelRole === 'mover' &&
      member.setupStatus === 'ready' &&
      hasLocationConsent &&
      member.arrivedAt === null;
  }

  canChooseAnchor(circle: Circle): boolean {
    return circle.isPrivatePlace && circle.state !== 'ended';
  }
}
