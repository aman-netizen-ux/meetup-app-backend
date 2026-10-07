import type { CircleEventPublisher } from '../domain/ports/circle_event_publisher.js';
import type { CircleEventWaiter } from '../domain/ports/circle_event_waiter.js';

interface RevisionWaiter {
  afterRevision: number;
  resolve: (changed: boolean) => void;
  timeout: NodeJS.Timeout;
}

export class InMemoryCircleEventBroker
implements CircleEventPublisher, CircleEventWaiter {
  private readonly revisions = new Map<string, number>();
  private readonly waiters = new Map<string, Set<RevisionWaiter>>();

  publish(circleId: string, revision: number): void {
    const latest = Math.max(this.revisions.get(circleId) ?? 0, revision);
    this.revisions.set(circleId, latest);
    const circleWaiters = this.waiters.get(circleId);
    if (!circleWaiters) return;
    for (const waiter of [...circleWaiters]) {
      if (latest <= waiter.afterRevision) continue;
      clearTimeout(waiter.timeout);
      circleWaiters.delete(waiter);
      waiter.resolve(true);
    }
    if (circleWaiters.size === 0) this.waiters.delete(circleId);
  }

  waitForRevision(
    circleId: string,
    afterRevision: number,
    timeoutMs: number,
  ): Promise<boolean> {
    if ((this.revisions.get(circleId) ?? 0) > afterRevision) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const circleWaiters = this.waiters.get(circleId) ?? new Set();
      const waiter: RevisionWaiter = {
        afterRevision,
        resolve,
        timeout: setTimeout(() => {
          circleWaiters.delete(waiter);
          if (circleWaiters.size === 0) this.waiters.delete(circleId);
          resolve(false);
        }, timeoutMs),
      };
      circleWaiters.add(waiter);
      this.waiters.set(circleId, circleWaiters);
    });
  }
}
