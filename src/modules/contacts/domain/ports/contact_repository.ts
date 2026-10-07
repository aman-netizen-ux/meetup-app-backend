import type { ContactCandidate } from '../entities/contact_candidate.js';
import type { ContactMatch } from '../entities/contact_match.js';

export interface ContactRepository {
  match(
    circleId: string,
    requesterId: string,
    candidates: ContactCandidate[],
    expiresAt: Date,
  ): Promise<ContactMatch[]>;
  addMember(
    circleId: string,
    requesterId: string,
    matchId: string,
  ): Promise<boolean>;
}
