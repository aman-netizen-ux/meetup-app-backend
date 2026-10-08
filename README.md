# Meetup app backend

Node.js and TypeScript API for the meetup coordination app. This is a separate Git repository from the Flutter client.

For a new chat or contributor, start with [HANDOFF.md](HANDOFF.md), [ARCHITECTURE.md](ARCHITECTURE.md), [TASKS.md](TASKS.md), and the copied [MVP scope](docs/meetup-app-mvp-scope.md).

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
npm run dev
```

`GET http://127.0.0.1:3000/health` returns the API health status. The server loads `.env` when present.

## Phone sign-in setup

The API uses Firebase Authentication to verify phone sign-in ID tokens. Create a Firebase project, enable the Phone provider, and set `FIREBASE_PROJECT_ID` in local `.env`. Give the backend a service-account credential through the local `GOOGLE_APPLICATION_CREDENTIALS` environment variable; keep that JSON file outside Git. Set `DATABASE_URL` and run `npm run migrate` against PostgreSQL 16. Without `FIREBASE_PROJECT_ID`, the server runs only the health route.

`GOOGLE_APPLICATION_CREDENTIALS` is a local development path, not an app setting. When deploying to Google Cloud, attach a least-privilege service account to the backend and let Application Default Credentials discover it; do not upload a downloaded service-account key or bundle it with the Flutter app. Other hosts should provide a managed workload identity or secret-mounted credential. The deployed API also needs its own PostgreSQL connection and public HTTPS URL.

For the current free staging plan, Render stores the complete service-account JSON in the encrypted `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. The Firebase infrastructure adapter reads it only at backend startup; it is never sent to Flutter or copied into the image. See [the staging deployment guide](docs/staging-deployment.md).

After a Flutter user signs in, the client sends its Firebase ID token as `Authorization: Bearer <token>`. `GET /v1/me` creates or returns the local user, `PATCH /v1/me` sets the display name, and `POST /v1/me/device-tokens` registers an Android or iOS push token. The backend requires a verified phone claim; it never accepts a phone number or user ID from the client as proof of identity. Run `npm run test:auth` for the API and database integration check using a fake identity verifier. Real Firebase token verification still requires your project credentials.

## Local PostgreSQL

Copy `.env.example` to `.env` and replace the sample password in **both** `POSTGRES_PASSWORD` and `DATABASE_URL`. To run PostgreSQL 16 with Podman Desktop, create an ignored `.postgres.env` with `POSTGRES_USER=meetup`, `POSTGRES_DB=meetup`, and the same `POSTGRES_PASSWORD` value from `.env`, then start it:

```powershell
podman machine start podman-machine-default
podman run -d --name meetup-postgres -p 127.0.0.1:5432:5432 -v meetup_postgres_data:/var/lib/postgresql/data --env-file .postgres.env postgres:16-alpine
npm run migrate
```

On later starts, use `podman start meetup-postgres`; the named volume retains the database. Do not commit either local env file. Docker Compose remains an option on other machines:

```powershell
docker compose up -d postgres
npm run migrate
```

The first migration creates accounts, circles, memberships, invitations, journey tables, arrivals, push tokens, and indexes. Migration 002 adds short-lived contact-match grants. The `purge_circle_journey_data(circle_id)` database function deletes raw GPS samples, selected route snapshots, and live pins. Circle ending calls it in the same transaction as the state transition.

For a repeatable database check without a container, run `npm run test:db`. It applies the SQL to an in-memory PostgreSQL-compatible engine, inserts journey and arrival records, verifies that purge deletes granular data, and verifies that arrival summary data remains. The migration runner has also applied the schema to live PostgreSQL 16 under Podman.

Run `npm run test:domain` to compile and check the pure circle access policy, including the location-consent condition.

## Circles and destination search

Authenticated users can create, list, and view circles. The organizer can edit the optional meetup date/time and private-place flag, or end/cancel the circle. The backend derives the destination's IANA time zone from its coordinates and uses that zone for Scheduled/Active state. Run `npm run test:circles` for the lifecycle and authorization checks.

Set `GEOAPIFY_API_KEY` in the ignored local `.env` to enable authenticated `POST /v1/places/search`. The key is used only by the backend. Without it, the route returns `503 PLACE_SEARCH_UNAVAILABLE`; Flutter can still use a manual map pin. The endpoint returns provider-neutral suggestions, so replacing Geoapify later requires a new backend adapter. Run `npm run test:places` for its API contract checks.
The Flutter picker waits briefly between keystrokes and the backend caches identical normalized queries for five minutes to reduce provider requests. A production launch should also set rate limits and monitor usage.

## Invitation links

Set `INVITATION_BASE_URL` to the client link prefix. Local development uses `meetup://join`; production should use the final verified HTTPS join URL. Organizers create seven-day links through `POST /v1/circles/:id/invite-links`. Preview is public to the bearer of the link and exposes only destination, circle state, the private-place flag, and member display names. Acceptance and role changes require Firebase authentication.

The database stores only a SHA-256 hash of each random invitation token. Request logs record route templates rather than token-bearing paths. Run `npm run test:invitations` to verify hashed storage, preview privacy, acceptance, private-place role rules, and role editing.

## Contact matching

Organizers call `POST /v1/circles/:id/contacts/match` with at most 200 ephemeral local IDs and normalized E.164 phone numbers. Contact names are rejected and remain on the phone. The API returns mapped/unmapped status without returning phone numbers and does not persist the submitted address book. A mapped user receives a random 15-minute grant; `POST /v1/circles/:id/contact-members` consumes it and creates a pending membership with no location pin. The new member must choose their own role and grant location permission in later client flows before tracking starts.

Run `npm run test:contacts` for authorization, response/storage privacy, self-exclusion, grant use, and pending-membership checks. Production operations in B-14 must periodically delete expired grants.

## Live circle snapshots

An authenticated member calls `GET /v1/circles/:id/events?afterRevision=N`. The request returns a complete snapshot as soon as the circle has a higher revision, or `204` after the long-poll timeout. Reconnect with the last applied revision; do not merge missed patches. The mapper exposes public pin, leg, ETA range, and arrival fields but never serializes `leave_by_at`. A pending member receives membership/setup data with all live state suppressed until they confirm their role.

The current broker is process-local, which is suitable for one API instance. B-14 must replace or bridge it with PostgreSQL notifications or a shared event service before running multiple API instances. Run `npm run test:realtime` for authentication, reconnect snapshot, pending-viewer privacy, role wake-up, and live-field mapping.

## Next implementation slice

B-10 route selection, B-11 checkpoint/ETA progress, and B-12/B-13 notifications/lifecycle are implemented. `POST /v1/circles/:id/me/arrival` marks the signed-in ready mover Here, stops that member's sharing, and can end the circle as all-arrived. A minute scheduler arms dated circles in their destination time zone and expires active circles after 12 hours. Push messages are deduplicated by event and device token; they notify ready peers about arrival, meaningful ETA changes, and leg changes. The Flutter client is maintained in the separate [meetup-app-frontend](https://github.com/aman-netizen-ux/meetup-app-frontend) repository.

The [routing-spike results](docs/routing-spike.md) record the Bengaluru test matrix and provider limitations. `npm run spike:routes` uses the ignored local Geoapify key and prints only sanitized route summaries.
