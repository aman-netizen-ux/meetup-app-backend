import type { CircleDetails } from '../../circles/domain/entities/circle_details.js';
import { CircleNotificationPolicy } from '../domain/circle_notification_policy.js';
import type { NotificationDeliveryRepository } from '../domain/ports/notification_delivery_repository.js';
import type { NotificationSender } from '../domain/ports/notification_sender.js';

export class DispatchCircleNotifications {
  constructor(
    private readonly policy: CircleNotificationPolicy,
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly sender: NotificationSender,
  ) {}

  async execute(before: CircleDetails, after: CircleDetails): Promise<void> {
    try {
      for (const notification of this.policy.notifications(before, after)) {
        for (const userId of notification.recipientUserIds) {
          for (const token of await this.deliveries.tokensForUser(userId)) {
            if (await this.deliveries.claim(notification.eventKey, token)) {
              await this.sender.send(token, notification);
            }
          }
        }
      }
    } catch {
      // Delivery is intentionally best-effort; a failed push must never reject a location update.
    }
  }
}
