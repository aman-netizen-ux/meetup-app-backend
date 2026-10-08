import type { CircleNotification } from '../entities/circle_notification.js';

export interface NotificationSender {
  send(token: string, notification: CircleNotification): Promise<void>;
}
