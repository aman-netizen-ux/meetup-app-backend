import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { CreateCircle } from '../modules/circles/application/create_circle.js';
import { EndCircle } from '../modules/circles/application/end_circle.js';
import { ListCircles } from '../modules/circles/application/list_circles.js';
import { UpdateCircle } from '../modules/circles/application/update_circle.js';
import { ViewCircle } from '../modules/circles/application/view_circle.js';
import { ChangeMemberRole } from '../modules/circles/application/change_member_role.js';
import { CircleSchedulePolicy } from '../modules/circles/domain/circle_schedule_policy.js';
import { GeoTimeZoneResolver } from '../modules/circles/infrastructure/geo_time_zone_resolver.js';
import { PgCircleRepository } from '../modules/circles/infrastructure/pg_circle_repository.js';
import type { CircleRouteActions } from '../modules/circles/presentation/circle_routes.js';
import { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';
import type { CircleEventPublisher } from '../modules/circles/domain/ports/circle_event_publisher.js';
import type { CircleEventWaiter } from '../modules/circles/domain/ports/circle_event_waiter.js';
import { WaitForCircleChange } from '../modules/circles/application/wait_for_circle_change.js';
import { StartLocationSharing } from '../modules/circles/application/start_location_sharing.js';
import { IngestLocation } from '../modules/circles/application/ingest_location.js';
import { LocationUpdatePolicy } from '../modules/circles/domain/location_update_policy.js';
import { PgJourneyProgressRepository } from '../modules/journeys/infrastructure/pg_journey_progress_repository.js';
import { MarkArrived } from '../modules/circles/application/mark_arrived.js';
import { CircleNotificationPolicy } from '../modules/notifications/domain/circle_notification_policy.js';
import { DispatchCircleNotifications } from '../modules/notifications/application/dispatch_circle_notifications.js';
import { PgNotificationDeliveryRepository } from '../modules/notifications/infrastructure/pg_notification_delivery_repository.js';
import { FirebaseNotificationSender } from '../modules/notifications/infrastructure/firebase_notification_sender.js';

export function createCircleActions(
  poolProvider: PgPoolProvider,
  auth: AuthRouteActions,
  events: CircleEventPublisher & CircleEventWaiter,
): CircleRouteActions {
  const circles = new PgCircleRepository(poolProvider.getPool());
  const schedule = new CircleSchedulePolicy();
  const locationPolicy = new LocationUpdatePolicy();
  const notifications = new DispatchCircleNotifications(
    new CircleNotificationPolicy(), new PgNotificationDeliveryRepository(poolProvider.getPool()), new FirebaseNotificationSender(),
  );
  return {
    authenticate: auth.authenticate,
    create: new CreateCircle(circles, new GeoTimeZoneResolver(), schedule),
    list: new ListCircles(circles), view: new ViewCircle(circles),
    update: new UpdateCircle(circles, schedule, events),
    end: new EndCircle(circles, events),
    changeRole: new ChangeMemberRole(circles, events),
    waitForChange: new WaitForCircleChange(circles, events),
    startLocationSharing: new StartLocationSharing(circles, locationPolicy, events),
    ingestLocation: new IngestLocation(
      circles,
      locationPolicy,
      events,
      new PgJourneyProgressRepository(poolProvider.getPool()),
      notifications,
    ),
    markArrived: new MarkArrived(circles, events, notifications),
  };
}
