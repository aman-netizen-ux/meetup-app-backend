# Backend task plan

This repository owns the Node.js API, persistence, routing integration, real-time events, notifications, and location-data lifecycle. The product requirements are in [docs/meetup-app-mvp-scope.md](docs/meetup-app-mvp-scope.md). Follow [ARCHITECTURE.md](ARCHITECTURE.md) for every task. Task IDs are stable so future chats can take one task at a time. Update the status and [HANDOFF.md](HANDOFF.md) whenever a task is finished.

**Status key:** `NEXT` = ready to start, `TODO` = planned, `BLOCKED` = needs a decision or dependency, `DONE` = acceptance checks met. Do not mark a task done for a stub or mock unless its acceptance check explicitly calls for one.

## Phase -1: contracts and feasibility

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-01 | DONE | Write the circle state and API contract. Specify independent optional date/time fields, destination time zone, Scheduled/Active/Ended transitions, organizer and mover/anchor permissions, arrival/end rules, error responses, and which fields are private. Publish request/response and event examples that the client can implement. | Scope / F-01 |
| B-02 | BLOCKED | Run a routing provider spike for the pilot city: request walking, road, and transit options; inspect leg/stop details, coverage, traffic/schedule data, quotas, and cost. Record sample sanitized responses and provider gaps. Do not commit API keys. Google Routes is deferred because its billing account requires a ₹3,000 activation prepayment; evaluate whether Geoapify meets transit/traffic needs or choose another provider before collecting live responses. | Ramagondanahalli, Bengaluru / F-02; routing-provider access needed locally |
| B-03 | DONE | Add local PostgreSQL setup, migrations, and test database instructions. Model users, circles, memberships, invitations, selected routes, location samples, arrival events, and device push tokens. Add indexes and a deletion path for raw location data. | B-01 |

## Milestone 1: accounts and circles

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-04 | DONE | Firebase ID-token verification, phone-bound local account creation, profile routes, and device-token registration are implemented. Firebase Admin and live PostgreSQL 16 under Podman are configured locally. A real Android test-number ID token created one phone-bound account through `GET /v1/me`; display-name update and session restoration succeeded. Revoking the test session caused the app to sign out, and signing in again recovered the existing account. Unauthenticated profile access returns 401. The schema supports multiple memberships per user. | F-04 |
| B-05 | DONE | Create, list, view, update, cancel, and manually end circles with PostgreSQL. Destination and destination time zone are validated; date and time remain independent; private-place and organizer rules are enforced. Creation and ending are transactional, and ending purges raw journey data. `npm run test:circles` passes. A real Android client successfully searched for a destination, created an Active circle, ended it, and reloaded its Ended summary from PostgreSQL. | B-03, B-04 / F-05 |
| B-06 | DONE | Implemented organizer-only invite-link creation, public privacy-limited preview, authenticated acceptance, mover/anchor validation, idempotent membership, and authenticated role edits. Raw link tokens are returned once and stored only as SHA-256 hashes; route-template logging keeps tokens out of request logs. Automated PostgreSQL/API tests and Android warm/cold link tests pass. The client’s final HTTPS domain and store association remain in F-06 release configuration. | B-05 / F-06, F-08 |
| B-07 | DONE | Organizer-scoped contact matching compares verified phone numbers without accepting names or retaining submitted numbers. Mapped users can be added through a 15-minute match grant; they remain pending with no location pin until they confirm their role and complete the later location-consent flow. Nonusers stay unmapped for the client share-sheet handoff. Automated API/PostgreSQL tests and an Android client request pass. | B-04, B-06 / F-07 |

## Milestone 2: live journey

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-08 | DONE | Added authenticated revision-based long polling at `GET /v1/circles/:id/events`. It returns a complete newer snapshot immediately or 204 after the wait, so reconnect never depends on missed patches. Membership, role, state, public pin/leg/ETA, and arrival fields use the same privacy-filtered mapper; pending viewers receive no live state, and leave-by is never serialized. Current membership/role/state mutations publish revisions; B-09 through B-13 must publish through the same broker when they add new mutations. Automated PostgreSQL/API and Android tests pass. | B-05, B-06 / F-08, F-09 |
| B-09 | TODO | Accept location updates only from active-circle movers with consent state supplied by the client. Validate accuracy/timestamps, record sharing start, mark stale GPS as in transit, stop updates on arrival or role switch, and reject updates after a circle ends. | B-05, B-08 / F-10, F-12 |
| B-10 | TODO | Integrate the routing provider behind an adapter. Return suggested routes with leg modes, durations, and checkpoints; persist each mover's explicit choice. Handle no-route and changed-route cases. | B-02, B-09 / F-11 |
| B-11 | TODO | Track checkpoint/leg progress and compute ETA ranges from completed, current, and future legs. Compute leave-by only against an organizer-set meetup time, expose it only to that mover, and never synthesize a group target time. Record assumptions and test traffic/transit edge cases. | B-09, B-10 / F-12, F-13 |

## Milestone 3: completion and delivery

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-12 | TODO | Send throttled push notifications for arrival, meaningful ETA changes, and leg transitions. Avoid duplicate sends; respect circle end and individual arrival. | B-04, B-08, B-11 / F-14 |
| B-13 | TODO | Arm dated circles on their event date; end when all movers arrive, on organizer action, or after the safety timeout. Stop real-time sharing and promptly purge granular location trails while retaining only approved summary metadata. Make expiry and purge jobs restart-safe. | B-05, B-09 / F-14 |
| B-14 | TODO | Add integration tests for authorization, lifecycle, role changes, private leave-by, location rejection, arrival broadcasts, and deletion. Add request limits, operational logging without raw GPS, deployment configuration, and a restore/rollback procedure. Replace the local file-based `GOOGLE_APPLICATION_CREDENTIALS` configuration with a production backend identity (prefer a host-attached service account), provision production PostgreSQL, and verify Firebase Admin token checks after deployment. Never package the service-account JSON in the app, image, or Git. | B-04 through B-13 / F-15 |

## Cross-repo sequence

1. Agree on B-01 with F-01 before building API consumers.
2. Prove B-02 and F-02 before promising background checkpoint timing or transit ETA precision.
3. Deliver B-04 through B-07 alongside F-04 through F-08 as the first usable create/join slice.
4. Deliver live location and route selection before ETA, push, and cleanup behavior.

See [HANDOFF.md](HANDOFF.md) for current state and unresolved decisions. The source scope is a requirements reference, not an instruction to execute every v1 feature in one chat.
