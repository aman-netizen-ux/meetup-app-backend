import type { Destination } from '../domain/entities/destination.js';

export interface CreateCircleCommand {
  destination: Destination;
  isPrivatePlace: boolean;
  meetupDate: string | null;
  meetupTime: string | null;
  timeZone?: string;
}

export interface UpdateCircleCommand {
  meetupDate?: string | null;
  meetupTime?: string | null;
  isPrivatePlace?: boolean;
}
