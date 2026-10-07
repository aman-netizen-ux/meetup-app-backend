import { createHash, randomBytes } from 'node:crypto';
import type { InvitationToken, InvitationTokenService } from '../domain/ports/invitation_token_service.js';

export class NodeInvitationTokenService implements InvitationTokenService {
  create(): InvitationToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }
}
