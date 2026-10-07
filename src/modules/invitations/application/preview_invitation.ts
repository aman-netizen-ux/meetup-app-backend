import type { InvitationRecord } from '../domain/entities/invitation_record.js';
import { InvitationRuleError } from '../domain/invitation_rule_error.js';
import type { InvitationRepository } from '../domain/ports/invitation_repository.js';
import type { InvitationTokenService } from '../domain/ports/invitation_token_service.js';

export class PreviewInvitation {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly tokens: InvitationTokenService,
  ) {}

  async execute(rawToken: string): Promise<InvitationRecord> {
    const invitation = await this.invitations.findByTokenHash(this.tokens.hash(rawToken));
    if (!invitation || invitation.status === 'revoked') {
      throw new InvitationRuleError('INVITATION_NOT_FOUND', 'This invitation is not available.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new InvitationRuleError('INVITATION_EXPIRED', 'This invitation has expired.');
    }
    if (invitation.state === 'ended') {
      throw new InvitationRuleError('CIRCLE_ENDED', 'This circle has ended.');
    }
    return invitation;
  }
}
