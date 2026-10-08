import 'dotenv/config';
import { createApp } from './app/create_app.js';
import { createAuthActions } from './app/create_auth_actions.js';
import { createCircleActions } from './app/create_circle_actions.js';
import { createInvitationActions } from './app/create_invitation_actions.js';
import { createContactActions } from './app/create_contact_actions.js';
import { PgPoolProvider } from './shared/infrastructure/database/pg_pool.js';
import { SearchPlaces } from './modules/places/application/search_places.js';
import { GeoapifyPlaceSearch } from './modules/places/infrastructure/geoapify_place_search.js';
import { InMemoryCircleEventBroker } from './modules/circles/infrastructure/in_memory_circle_event_broker.js';
import { createJourneyRouteActions } from './app/create_journey_route_actions.js';
import { PgCircleRepository } from './modules/circles/infrastructure/pg_circle_repository.js';
import { AdvanceCircleLifecycle } from './modules/circles/application/advance_circle_lifecycle.js';
import { CircleLifecycleScheduler } from './modules/circles/infrastructure/circle_lifecycle_scheduler.js';

const poolProvider = new PgPoolProvider();
const circleEvents = new InMemoryCircleEventBroker();
const authActions = process.env.FIREBASE_PROJECT_ID
  ? createAuthActions(poolProvider)
  : undefined;
const circleActions = authActions
  ? createCircleActions(poolProvider, authActions, circleEvents)
  : undefined;
const invitationActions = authActions
  ? createInvitationActions(
    poolProvider,
    authActions,
    process.env.INVITATION_BASE_URL ?? 'meetup://join',
    circleEvents,
  )
  : undefined;
const contactActions = authActions
  ? createContactActions(poolProvider, authActions, circleEvents)
  : undefined;
const placeSearch = process.env.GEOAPIFY_API_KEY
  ? new SearchPlaces(new GeoapifyPlaceSearch(process.env.GEOAPIFY_API_KEY))
  : null;
const journeyRouteActions = authActions && process.env.GEOAPIFY_API_KEY
  ? createJourneyRouteActions(poolProvider, authActions, circleEvents, process.env.GEOAPIFY_API_KEY)
  : undefined;
const app = createApp(
  authActions, circleActions, placeSearch, invitationActions, contactActions, journeyRouteActions,
);
const lifecycleScheduler = authActions
  ? new CircleLifecycleScheduler(new AdvanceCircleLifecycle(new PgCircleRepository(poolProvider.getPool()), circleEvents))
  : null;
lifecycleScheduler?.start();
app.addHook('onClose', async () => poolProvider.close());
app.addHook('onClose', async () => lifecycleScheduler?.stop());

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
