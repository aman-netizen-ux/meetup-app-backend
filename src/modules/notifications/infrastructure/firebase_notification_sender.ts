import { getMessaging } from 'firebase-admin/messaging';
import type { CircleNotification } from '../domain/entities/circle_notification.js';
import type { NotificationSender } from '../domain/ports/notification_sender.js';

export class FirebaseNotificationSender implements NotificationSender {
  async send(token: string, notification: CircleNotification): Promise<void> {
    await getMessaging().send({
      token,
      notification: { title: notification.title, body: notification.body },
      data: { type: 'circle_update', circleId: notification.circleId },
      android: { priority: 'high' },
    });
  }
}
