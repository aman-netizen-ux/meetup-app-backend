import { AdvanceCircleLifecycle } from '../application/advance_circle_lifecycle.js';

export class CircleLifecycleScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly lifecycle: AdvanceCircleLifecycle) {}

  start(): void {
    void this.lifecycle.execute();
    this.timer = setInterval(() => void this.lifecycle.execute(), 60_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
