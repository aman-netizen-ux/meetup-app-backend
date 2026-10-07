import { randomUUID } from 'node:crypto';
import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import type { InvitationLink } from '../domain/entities/invitation_link.js';
import { InvitationRuleError } from '../domain/invitation_rule_error.js';
import type { InvitationRepository } from '../domain/ports/invitation_repository.js';
import type { InvitationTokenService } from '../domain/ports/invitation_token_service.js';

export class CreateInvitationLink {
  constructor(
    private readonly circles: CircleRepository,
    private readonly invitations: InvitationRepository,
    private readonly tokens: InvitationTokenService,
    private readonly baseUrl: string,
  ) {}

  async execute(circleId: string, userId: string): Promise<InvitationLink> {
    const circle = await this.circles.findForUser(circleId, userId);
    if (!circle) throw new InvitationRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (circle.organizerId !== userId) {
      throw new InvitationRuleError('FORBIDDEN', 'Only the organizer can invite people.');
    }
    if (circle.state === 'ended') {
      throw new InvitationRuleError('CIRCLE_ENDED', 'This circle has ended.');
    }

    const token = this.tokens.create();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.invitations.create({
      id: randomUUID(), circleId, createdBy: userId,
      tokenHash: token.hash, expiresAt,
    });
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/${token.raw}`,
      expiresAt,
    };
  }
}
