import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import type { ContactCandidate } from '../domain/entities/contact_candidate.js';
import type { ContactMatch } from '../domain/entities/contact_match.js';
import { ContactRuleError } from '../domain/contact_rule_error.js';
import type { ContactRepository } from '../domain/ports/contact_repository.js';

export class MatchContacts {
  constructor(
    private readonly circles: CircleRepository,
    private readonly contacts: ContactRepository,
  ) {}

  async execute(
    circleId: string,
    requesterId: string,
    candidates: ContactCandidate[],
  ): Promise<ContactMatch[]> {
    const circle = await this.circles.findForUser(circleId, requesterId);
    if (!circle) throw new ContactRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (circle.organizerId !== requesterId) {
      throw new ContactRuleError('FORBIDDEN', 'Only the organizer can add contacts.');
    }
    if (circle.state === 'ended') {
      throw new ContactRuleError('CIRCLE_ENDED', 'This circle has ended.');
    }
    if (candidates.length === 0 || candidates.length > 200) {
      throw new ContactRuleError('INVALID_CONTACTS', 'Choose between 1 and 200 contacts.');
    }
    const localIds = new Set(candidates.map((candidate) => candidate.localId));
    if (localIds.size !== candidates.length) {
      throw new ContactRuleError('INVALID_CONTACTS', 'Contact identifiers must be unique.');
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return this.contacts.match(circleId, requesterId, candidates, expiresAt);
  }
}
