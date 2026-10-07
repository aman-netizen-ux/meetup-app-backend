import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { AddContactMember } from '../modules/contacts/application/add_contact_member.js';
import { MatchContacts } from '../modules/contacts/application/match_contacts.js';
import { PgContactRepository } from '../modules/contacts/infrastructure/pg_contact_repository.js';
import type { ContactRouteActions } from '../modules/contacts/presentation/contact_routes.js';
import { PgCircleRepository } from '../modules/circles/infrastructure/pg_circle_repository.js';
import { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';
import type { CircleEventPublisher } from '../modules/circles/domain/ports/circle_event_publisher.js';

export function createContactActions(
  poolProvider: PgPoolProvider,
  auth: AuthRouteActions,
  events: CircleEventPublisher,
): ContactRouteActions {
  const pool = poolProvider.getPool();
  const circles = new PgCircleRepository(pool);
  const contacts = new PgContactRepository(pool);
  return {
    authenticate: auth.authenticate,
    match: new MatchContacts(circles, contacts),
    addMember: new AddContactMember(contacts, circles, events),
  };
}
