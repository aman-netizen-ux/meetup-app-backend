import type { DeviceTokenRepository } from '../domain/ports/device_token_repository.js';

export class RegisterDeviceToken {
  constructor(private readonly tokens: DeviceTokenRepository) {}

  execute(userId: string, platform: 'android' | 'ios', token: string): Promise<void> {
    if (!token || token.length > 4096) throw new RangeError('Invalid device token.');
    return this.tokens.register(userId, platform, token);
  }
}
