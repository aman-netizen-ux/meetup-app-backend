import type { CircleDetails, CircleMemberDetails } from '../../circles/domain/entities/circle_details.js';
import type { CircleNotification } from './entities/circle_notification.js';

/** Pure, conservative notification rules. Snapshot streaming remains the source of truth. */
export class CircleNotificationPolicy {
  notifications(before: CircleDetails, after: CircleDetails): CircleNotification[] {
    const changed = after.members.filter((member) => this.changed(before, member));
    return changed.flatMap((member) => this.forMember(before, after, member));
  }

  private changed(before: CircleDetails, member: CircleMemberDetails): CircleMemberDetails | null {
    return before.members.find((item) => item.userId === member.userId) ?? null;
  }

  private forMember(
    before: CircleDetails,
    after: CircleDetails,
    member: CircleMemberDetails,
  ): CircleNotification[] {
    const prior = this.changed(before, member);
    if (!prior) return [];
    const recipients = after.members
      .filter((item) => item.userId !== member.userId && item.setupStatus === 'ready')
      .map((item) => item.userId);
    if (recipients.length === 0) return [];
    if (!prior.arrivedAt && member.arrivedAt) {
      return [{
        eventKey: `arrival:${after.id}:${member.userId}:${member.arrivedAt.toISOString()}`,
        title: 'Meetup update', body: `${member.displayName} has arrived.`,
        circleId: after.id, recipientUserIds: recipients,
      }];
    }
    if (after.state !== 'active' || member.arrivedAt) return [];
    const notifications: CircleNotification[] = [];
    if (prior.currentLeg?.label !== member.currentLeg?.label && member.currentLeg) {
      notifications.push({
        eventKey: `leg:${after.id}:${member.userId}:${after.revision}:${member.currentLeg.label}`,
        title: 'Journey update', body: `${member.displayName} is now ${member.currentLeg.label}.`,
        circleId: after.id, recipientUserIds: recipients,
      });
    }
    const etaChanged = prior.etaMinutes && member.etaMinutes &&
      Math.max(
        Math.abs(prior.etaMinutes.min - member.etaMinutes.min),
        Math.abs(prior.etaMinutes.max - member.etaMinutes.max),
      ) >= 5;
    if (etaChanged && member.etaMinutes) {
      notifications.push({
        eventKey: `eta:${after.id}:${member.userId}:${after.revision}`,
        title: 'Journey update',
        body: `${member.displayName}'s ETA is now ${member.etaMinutes.min}–${member.etaMinutes.max} min.`,
        circleId: after.id, recipientUserIds: recipients,
      });
    }
    return notifications;
  }
}
