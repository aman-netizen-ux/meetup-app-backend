# Backend task plan

This repository owns the Node.js API, persistence, routing integration, real-time events, notifications, and location-data lifecycle. The product requirements are in [docs/meetup-app-mvp-scope.md](docs/meetup-app-mvp-scope.md). Follow [ARCHITECTURE.md](ARCHITECTURE.md) for every task. Task IDs are stable so future chats can take one task at a time. Update the status and [HANDOFF.md](HANDOFF.md) whenever a task is finished.

**Status key:** `NEXT` = ready to start, `TODO` = planned, `BLOCKED` = needs a decision or dependency, `DONE` = acceptance checks met. Do not mark a task done for a stub or mock unless its acceptance check explicitly calls for one.

## Phase -1: contracts and feasibility

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-01 | DONE | Write the circle state and API contract. Specify independent optional date/time fields, destination time zone, Scheduled/Active/Ended transitions, organizer and mover/anchor permissions, arrival/end rules, error responses, and which fields are private. Publish request/response and event examples that the client can implement. | Scope / F-01 |
| B-02 | DONE | Ran sanitized Geoapify walking, approximated-traffic road, scheduled transit, and approximated-transit requests from Whitefield/Ramagondanahalli to Kadugodi Tree Park and MG Road. Walk/drive/approximated transit returned routes; scheduled transit returned no reachable stop. Chose Geoapify behind an adapter for the current MVP, with road and estimated-public-transport labels and documented traffic/schedule/stop-detail limits. No key or raw personal location was committed. | Ramagondanahalli, Bengaluru / F-02 |
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
| B-09 | DONE | Location start and update endpoints accept only an authenticated active, ready mover with explicit client consent. They validate coordinates, accuracy, capture time, ordering, and sharing state; transactionally save samples/public pins, record manual/departure start, increment the snapshot revision, and publish it. Pins older than two minutes map to in-transit. Arrival, role switch, and circle end reject later samples. | B-05, B-08 / F-10, F-12 |
| B-10 | DONE | Geoapify routing is isolated behind a provider port and normalizes walking, approximated-traffic road, and estimated public-transport choices with geometry, legs, durations, and transition checkpoints. Fifteen-minute server-owned option IDs prevent client-forged routes. Explicit selection persists one route per mover, replaces a prior choice, updates the current leg/revision, and publishes the change. Empty provider results remain recoverable. PostgreSQL/API tests cover authorization, selection, replacement, forged IDs, and no-route behavior; a live Bengaluru normalization check returned all three modes with polylines and checkpoints. | B-02, B-09 / F-11 |
| B-11 | DONE | Accepted location samples now advance the explicitly selected route by matching the public point to provider geometry and transition checkpoints. The backend transaction stores current leg, mode-aware ETA range, and a conservative leave-by derived from the slower ETA bound. Leave-by and arrival delta exist only in authenticated `/me`; shared snapshots expose the leg/ETA range but never private timing. Untimed circles never synthesize a target or early/late framing. Route changes clear stale estimates. Pure policy and PostgreSQL/API tests cover road/transit uncertainty, leg changes, timed/untimed privacy, nonmember access, and persistence. Assumptions are documented in `docs/journey-progress.md`. | B-09, B-10 / F-12, F-13 |

## Milestone 3: completion and delivery

| ID | Status | Task and acceptance checks | Depends on / frontend partner |
|---|---|---|---|
| B-12 | DONE | Firebase push delivery is registered per device and uses a pure policy for arrival, meaningful (5+ minute) ETA changes, and leg transitions. PostgreSQL delivery claims deduplicate each event/token across retries and restarts; failed pushes never reject sharing. Only ready circle members other than the changed mover receive a notification. | B-04, B-08, B-11 / F-14 |
| B-13 | DONE | A restart-safe minute scheduler arms scheduled circles on the destination's local event date and ends active circles after 12 hours. Members can explicitly mark arrival; it stops their sharing, retains only the arrival timestamp, and ends/purges the circle when all ready movers arrive. End/cancel, all-arrived, and timeout all preserve summary metadata while purging granular journey data. | B-05, B-09 / F-14 |
| B-14 | IN PROGRESS | Free staging deployment configuration is present for one Render web service and Neon PostgreSQL, including a Docker build, health check, secret-only Firebase Admin credential option, migration-at-release, and documented restore/rollback procedure. Remaining: provision the accounts/secrets, deploy, verify authenticated Firebase Admin checks, add the remaining integration tests and request limits, and choose reliable production hosting/scheduling. Never package the service-account JSON in the app, image, or Git. | B-04 through B-13 / F-15 |

## Cross-repo sequence

1. Agree on B-01 with F-01 before building API consumers.
2. Prove B-02 and F-02 before promising background checkpoint timing or transit ETA precision.
3. Deliver B-04 through B-07 alongside F-04 through F-08 as the first usable create/join slice.
4. Deliver live location and route selection before ETA, push, and cleanup behavior.

See [HANDOFF.md](HANDOFF.md) for current state and unresolved decisions. The source scope is a requirements reference, not an instruction to execute every v1 feature in one chat.
