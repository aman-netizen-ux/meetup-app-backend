export interface DeviceTokenRepository {
  register(userId: string, platform: 'android' | 'ios', token: string): Promise<void>;
}
