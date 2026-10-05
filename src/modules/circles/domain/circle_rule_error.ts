export class CircleRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
