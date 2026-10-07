export interface ContactMatch {
  localId: string;
  status: 'mapped' | 'unmapped';
  displayName: string | null;
  matchId: string | null;
}
