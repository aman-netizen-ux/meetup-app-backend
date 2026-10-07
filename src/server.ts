import 'dotenv/config';
import { createApp } from './app/create_app.js';
import { createAuthActions } from './app/create_auth_actions.js';
import { createCircleActions } from './app/create_circle_actions.js';
import { createInvitationActions } from './app/create_invitation_actions.js';
import { createContactActions } from './app/create_contact_actions.js';
import { PgPoolProvider } from './shared/infrastructure/database/pg_pool.js';
import { SearchPlaces } from './modules/places/application/search_places.js';
import { GeoapifyPlaceSearch } from './modules/places/infrastructure/geoapify_place_search.js';

const poolProvider = new PgPoolProvider();
const authActions = process.env.FIREBASE_PROJECT_ID
  ? createAuthActions(poolProvider)
  : undefined;
const circleActions = authActions ? createCircleActions(poolProvider, authActions) : undefined;
const invitationActions = authActions
  ? createInvitationActions(poolProvider, authActions, process.env.INVITATION_BASE_URL ?? 'meetup://join')
  : undefined;
const contactActions = authActions
  ? createContactActions(poolProvider, authActions)
  : undefined;
const placeSearch = process.env.GEOAPIFY_API_KEY
  ? new SearchPlaces(new GeoapifyPlaceSearch(process.env.GEOAPIFY_API_KEY))
  : null;
const app = createApp(authActions, circleActions, placeSearch, invitationActions, contactActions);
app.addHook('onClose', async () => poolProvider.close());

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
