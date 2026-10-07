export class InvitationRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
