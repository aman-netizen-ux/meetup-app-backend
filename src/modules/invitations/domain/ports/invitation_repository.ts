import type { TravelRole } from '../../../circles/domain/entities/travel_role.js';
import type { InvitationRecord } from '../entities/invitation_record.js';

export interface NewInvitation {
  id: string;
  circleId: string;
  createdBy: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  create(input: NewInvitation): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  addMember(invitationId: string, circleId: string, userId: string, role: TravelRole): Promise<boolean>;
}
