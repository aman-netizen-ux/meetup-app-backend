import type { CircleDetails } from '../../circles/domain/entities/circle_details.js';
import type { CircleRepository } from '../../circles/domain/ports/circle_repository.js';
import { ContactRuleError } from '../domain/contact_rule_error.js';
import type { ContactRepository } from '../domain/ports/contact_repository.js';
import type { CircleEventPublisher } from '../../circles/domain/ports/circle_event_publisher.js';

export class AddContactMember {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly circles: CircleRepository,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(
    circleId: string,
    requesterId: string,
    matchId: string,
  ): Promise<CircleDetails> {
    const circle = await this.circles.findForUser(circleId, requesterId);
    if (!circle) throw new ContactRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (circle.organizerId !== requesterId) {
      throw new ContactRuleError('FORBIDDEN', 'Only the organizer can add contacts.');
    }
    const added = await this.contacts.addMember(circleId, requesterId, matchId);
    if (!added) {
      throw new ContactRuleError('CONTACT_MATCH_EXPIRED', 'Refresh contacts and try again.');
    }
    const updated = await this.circles.findForUser(circleId, requesterId);
    if (!updated) throw new ContactRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
