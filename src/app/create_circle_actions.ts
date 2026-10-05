import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { CreateCircle } from '../modules/circles/application/create_circle.js';
import { EndCircle } from '../modules/circles/application/end_circle.js';
import { ListCircles } from '../modules/circles/application/list_circles.js';
import { UpdateCircle } from '../modules/circles/application/update_circle.js';
import { ViewCircle } from '../modules/circles/application/view_circle.js';
import { CircleSchedulePolicy } from '../modules/circles/domain/circle_schedule_policy.js';
import { GeoTimeZoneResolver } from '../modules/circles/infrastructure/geo_time_zone_resolver.js';
import { PgCircleRepository } from '../modules/circles/infrastructure/pg_circle_repository.js';
import type { CircleRouteActions } from '../modules/circles/presentation/circle_routes.js';
import { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';

export function createCircleActions(poolProvider: PgPoolProvider, auth: AuthRouteActions): CircleRouteActions {
  const circles = new PgCircleRepository(poolProvider.getPool());
  const schedule = new CircleSchedulePolicy();
  return {
    authenticate: auth.authenticate,
    create: new CreateCircle(circles, new GeoTimeZoneResolver(), schedule),
    list: new ListCircles(circles), view: new ViewCircle(circles),
    update: new UpdateCircle(circles, schedule), end: new EndCircle(circles),
  };
}
