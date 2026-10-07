import { CircleRuleError } from '../domain/circle_rule_error.js';
import { CircleSchedulePolicy } from '../domain/circle_schedule_policy.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { UpdateCircleCommand } from './circle_commands.js';
import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';

export class UpdateCircle {
  constructor(
    private readonly circles: CircleRepository,
    private readonly schedule: CircleSchedulePolicy,
    private readonly events?: CircleEventPublisher,
  ) {}

  async execute(circleId: string, userId: string, command: UpdateCircleCommand): Promise<CircleDetails> {
    const existing = await this.circles.findForUser(circleId, userId);
    if (!existing) throw new CircleRuleError('CIRCLE_NOT_FOUND', 'Circle not found.');
    if (existing.organizerId !== userId) throw new CircleRuleError('FORBIDDEN', 'Only the organizer can edit this circle.');
    if (existing.state === 'ended') throw new CircleRuleError('CIRCLE_ENDED', 'This circle has ended.');
    if (existing.state === 'active' && command.meetupDate !== undefined && command.meetupDate !== existing.meetupDate) {
      throw new CircleRuleError('DATE_LOCKED', 'The date cannot change after the circle becomes active.');
    }
    if (command.isPrivatePlace !== undefined && command.isPrivatePlace !== existing.isPrivatePlace &&
        await this.circles.hasInvitees(circleId)) {
      throw new CircleRuleError('PRIVATE_PLACE_LOCKED', 'This setting cannot change after inviting people.');
    }
    const meetupDate = command.meetupDate === undefined ? existing.meetupDate : command.meetupDate;
    const meetupTime = command.meetupTime === undefined ? existing.meetupTime : command.meetupTime;
    const timing = this.schedule.resolve(meetupDate, meetupTime, existing.timeZone, new Date(), existing.state === 'active');
    const updated = await this.circles.update(circleId, userId, {
      meetupDate, meetupTime,
      isPrivatePlace: command.isPrivatePlace ?? existing.isPrivatePlace,
      state: existing.state === 'active' ? 'active' : timing.state,
      targetAt: timing.targetAt, armedAt: timing.armedAt,
      expectedRevision: existing.revision,
    });
    if (!updated) throw new CircleRuleError('CIRCLE_CHANGED', 'Circle changed while editing. Reload and try again.');
    this.events?.publish(updated.id, updated.revision);
    return updated;
  }
}
