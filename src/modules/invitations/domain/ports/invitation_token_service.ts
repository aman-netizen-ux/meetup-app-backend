export interface InvitationToken {
  raw: string;
  hash: string;
}

export interface InvitationTokenService {
  create(): InvitationToken;
  hash(raw: string): string;
}
