import { randomUUID } from 'node:crypto';
import { CircleRuleError } from '../domain/circle_rule_error.js';
import { CircleSchedulePolicy } from '../domain/circle_schedule_policy.js';
import type { CircleRepository } from '../domain/ports/circle_repository.js';
import type { TimeZoneResolver } from '../domain/ports/time_zone_resolver.js';
import type { CircleDetails } from '../domain/entities/circle_details.js';
import type { CreateCircleCommand } from './circle_commands.js';

export class CreateCircle {
  constructor(
    private readonly circles: CircleRepository,
    private readonly zones: TimeZoneResolver,
    private readonly schedule: CircleSchedulePolicy,
  ) {}

  async execute(organizerId: string, command: CreateCircleCommand): Promise<CircleDetails> {
    const destination = command.destination;
    if (destination.label.trim().length < 2 || destination.label.trim().length > 160 ||
        !Number.isFinite(destination.latitude) || Math.abs(destination.latitude) > 90 ||
        !Number.isFinite(destination.longitude) || Math.abs(destination.longitude) > 180 ||
        (destination.placeId !== null && destination.placeId.length > 255)) {
      throw new CircleRuleError('INVALID_DESTINATION', 'Choose a valid destination.');
    }
    const timeZone = this.zones.resolve(destination.latitude, destination.longitude);
    if (command.timeZone && command.timeZone !== timeZone) {
      throw new CircleRuleError('INVALID_TIME_ZONE', 'Destination time zone does not match its location.');
    }
    const timing = this.schedule.resolve(command.meetupDate, command.meetupTime, timeZone);
    return this.circles.create({
      id: randomUUID(), organizerId,
      destination: { ...destination, label: destination.label.trim() },
      isPrivatePlace: command.isPrivatePlace,
      meetupDate: command.meetupDate, meetupTime: command.meetupTime, timeZone,
      ...timing,
    });
  }
}
