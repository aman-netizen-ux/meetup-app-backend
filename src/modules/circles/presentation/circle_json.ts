import type { CircleDetails } from '../domain/entities/circle_details.js';

export function circleJson(circle: CircleDetails): Record<string, unknown> {
  return {
    id: circle.id, organizerId: circle.organizerId,
    destination: circle.destination, isPrivatePlace: circle.isPrivatePlace,
    meetupDate: circle.meetupDate, meetupTime: circle.meetupTime,
    timeZone: circle.timeZone, state: circle.state,
    endReason: circle.endReason, revision: circle.revision,
    members: circle.members.map((member) => ({
      userId: member.userId, displayName: member.displayName,
      isOrganizer: member.isOrganizer, travelRole: member.travelRole,
      setupStatus: member.setupStatus, presence: member.presence,
      pin: null, lastUpdatedAt: null, currentLeg: null,
      etaMinutes: null, arrivedAt: member.arrivedAt?.toISOString() ?? null,
    })),
  };
}
