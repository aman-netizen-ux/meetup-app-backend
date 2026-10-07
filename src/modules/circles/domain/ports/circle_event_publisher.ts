export interface CircleEventPublisher {
  publish(circleId: string, revision: number): void;
}
