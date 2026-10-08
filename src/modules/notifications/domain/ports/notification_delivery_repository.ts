export interface NotificationDeliveryRepository {
  tokensForUser(userId: string): Promise<string[]>;
  claim(eventKey: string, token: string): Promise<boolean>;
}
