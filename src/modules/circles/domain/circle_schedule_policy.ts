import { DateTime } from 'luxon';
import type { CircleState } from './entities/circle_state.js';
import { CircleRuleError } from './circle_rule_error.js';

export interface CircleSchedule {
  state: CircleState;
  targetAt: Date | null;
  armedAt: Date | null;
}

export class CircleSchedulePolicy {
  resolve(
    meetupDate: string | null,
    meetupTime: string | null,
    timeZone: string,
    now: Date = new Date(),
    allowPastDate = false,
  ): CircleSchedule {
    const localNow = DateTime.fromJSDate(now, { zone: timeZone });
    if (!localNow.isValid) throw new CircleRuleError('INVALID_TIME_ZONE', 'Destination time zone is invalid.');
    const today = localNow.toISODate()!;
    if (meetupDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(meetupDate) ||
          DateTime.fromISO(meetupDate, { zone: timeZone }).toISODate() !== meetupDate) {
        throw new CircleRuleError('INVALID_MEETUP_DATE', 'Choose a valid meetup date.');
      }
      if (meetupDate < today && !allowPastDate) throw new CircleRuleError('INVALID_MEETUP_DATE', 'Meetup date cannot be in the past.');
    }
    if (meetupTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetupTime)) {
      throw new CircleRuleError('INVALID_MEETUP_TIME', 'Choose a valid meetup time.');
    }
    const targetDate = meetupDate ?? today;
    let targetAt: Date | null = null;
    if (meetupTime !== null) {
      const localTarget = DateTime.fromISO(`${targetDate}T${meetupTime}`, { zone: timeZone });
      if (!localTarget.isValid || localTarget.toFormat('yyyy-MM-dd HH:mm') !== `${targetDate} ${meetupTime}`) {
        throw new CircleRuleError('INVALID_MEETUP_TIME', 'That local time does not exist at the destination.');
      }
      targetAt = localTarget.toJSDate();
    }
    const scheduled = meetupDate !== null && meetupDate > today;
    return { state: scheduled ? 'scheduled' : 'active', targetAt, armedAt: scheduled ? null : now };
  }
}
