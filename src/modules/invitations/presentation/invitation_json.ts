import type { InvitationRecord } from '../domain/entities/invitation_record.js';

export function invitationPreviewJson(invitation: InvitationRecord): Record<string, unknown> {
  return {
    destination: invitation.destination,
    state: invitation.state,
    isPrivatePlace: invitation.isPrivatePlace,
    memberNames: invitation.memberNames,
  };
}
