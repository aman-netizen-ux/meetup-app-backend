export interface CircleEventWaiter {
  waitForRevision(
    circleId: string,
    afterRevision: number,
    timeoutMs: number,
  ): Promise<boolean>;
}
