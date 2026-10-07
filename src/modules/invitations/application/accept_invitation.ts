import type { CircleDetails } from '../../circles/domain/entities/circle_details.js';
import type { TravelRole } from '../../circles/domain/entities/travel_role.js';
import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import { InvitationRuleError } from '../domain/invitation_rule_error.js';
import type { InvitationRepository } from '../domain/ports/invitation_repository.js';
import type { InvitationTokenService } from '../domain/ports/invitation_token_service.js';
import { PreviewInvitation } from './preview_invitation.js';

export class AcceptInvitation {
  private readonly preview: PreviewInvitation;

  constructor(
    private readonly invitations: InvitationRepository,
    private readonly tokens: InvitationTokenService,
    private readonly circles: CircleRepository,
  ) {
    this.preview = new PreviewInvitation(invitations, tokens);
  }

  async execute(rawToken: string, userId: string, role: TravelRole): Promise<CircleDetails> {
    const invitation = await this.preview.execute(rawToken);
    if (role === 'anchor' && !invitation.isPrivatePlace) {
      throw new InvitationRuleError('ANCHOR_NOT_ALLOWED', 'Anchor is available only at a private place.');
    }
    const accepted = await this.invitations.addMember(
      invitation.id, invitation.circleId, userId, role,
    );
    if (!accepted) {
      throw new InvitationRuleError('INVITATION_UNAVAILABLE', 'This invitation is no longer available.');
    }
    const circle = await this.circles.findForUser(invitation.circleId, userId);
    if (!circle) throw new InvitationRuleError('INVITATION_UNAVAILABLE', 'Could not join this circle.');
    return circle;
  }
}
