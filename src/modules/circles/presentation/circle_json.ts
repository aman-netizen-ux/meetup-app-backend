import type { CircleDetails } from '../domain/entities/circle_details.js';

export function circleJson(circle: CircleDetails): Record<string, unknown> {
  const canViewLive = circle.viewerSetupStatus === 'ready';
  return {
    id: circle.id, organizerId: circle.organizerId,
    destination: circle.destination, isPrivatePlace: circle.isPrivatePlace,
    meetupDate: circle.meetupDate, meetupTime: circle.meetupTime,
    timeZone: circle.timeZone, state: circle.state,
    endReason: circle.endReason, revision: circle.revision,
    members: circle.members.map((member) => ({
      userId: member.userId, displayName: member.displayName,
      isOrganizer: member.isOrganizer, travelRole: member.travelRole,
      setupStatus: member.setupStatus,
      presence: canViewLive ? member.presence : 'not_sharing',
      pin: canViewLive
        ? member.pin ?? (member.presence === 'fixed' ? {
            latitude: circle.destination.latitude,
            longitude: circle.destination.longitude,
          } : null)
        : null,
      lastUpdatedAt: canViewLive
        ? member.lastUpdatedAt?.toISOString() ?? null
        : null,
      currentLeg: canViewLive ? member.currentLeg : null,
      etaMinutes: canViewLive ? member.etaMinutes : null,
      arrivedAt: canViewLive ? member.arrivedAt?.toISOString() ?? null : null,
    })),
  };
}
