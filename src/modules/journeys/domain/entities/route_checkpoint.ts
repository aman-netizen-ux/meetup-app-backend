import type { RoutePoint } from './route_point.js';

export interface RouteCheckpoint extends RoutePoint {
  label: string;
  sequence: number;
}
