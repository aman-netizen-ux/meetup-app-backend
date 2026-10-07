import type { AuthRouteActions } from '../modules/auth/presentation/auth_routes.js';
import { AcceptInvitation } from '../modules/invitations/application/accept_invitation.js';
import { CreateInvitationLink } from '../modules/invitations/application/create_invitation_link.js';
import { PreviewInvitation } from '../modules/invitations/application/preview_invitation.js';
import { NodeInvitationTokenService } from '../modules/invitations/infrastructure/node_invitation_token_service.js';
import { PgInvitationRepository } from '../modules/invitations/infrastructure/pg_invitation_repository.js';
import type { InvitationRouteActions } from '../modules/invitations/presentation/invitation_routes.js';
import { PgCircleRepository } from '../modules/circles/infrastructure/pg_circle_repository.js';
import { PgPoolProvider } from '../shared/infrastructure/database/pg_pool.js';
import type { CircleEventPublisher } from '../modules/circles/domain/ports/circle_event_publisher.js';

export function createInvitationActions(
  poolProvider: PgPoolProvider,
  auth: AuthRouteActions,
  baseUrl: string,
  events: CircleEventPublisher,
): InvitationRouteActions {
  const pool = poolProvider.getPool();
  const circles = new PgCircleRepository(pool);
  const invitations = new PgInvitationRepository(pool);
  const tokens = new NodeInvitationTokenService();
  return {
    authenticate: auth.authenticate,
    createLink: new CreateInvitationLink(circles, invitations, tokens, baseUrl),
    preview: new PreviewInvitation(invitations, tokens),
    accept: new AcceptInvitation(invitations, tokens, circles, events),
  };
}
