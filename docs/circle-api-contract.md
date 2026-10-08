# Circle API contract (v1 draft)

Owner: B-01. Client partner: F-01. Account, circle lifecycle, invitations, contact matching, self-role changes, and revision-based live snapshots are implemented. Journey mutation routes remain for later tasks. Source: [MVP scope](meetup-app-mvp-scope.md). JSON names use `camelCase`; IDs are opaque strings; timestamps are ISO 8601 UTC instants; dates use `YYYY-MM-DD`; times use 24-hour `HH:mm`; coordinates use WGS84 decimal latitude/longitude. All `/v1` endpoints require a verified-user bearer token except an invitation preview, which still must not expose live locations.

| Account endpoint | Response / body | Status |
|---|---|---|
| `GET /v1/me` | `{ "user": { "id": "...", "phoneE164": "+919876543210", "displayName": "Member", "profileCompleted": false } }` | `200`; creates local account on first valid token |
| `PATCH /v1/me` | Body `{ "displayName": "Priya" }`; returns updated `user` with `profileCompleted: true` | `200` |
| `POST /v1/me/device-tokens` | Body `{ "platform": "android", "token": "..." }` | `204` |

## Identity, circle, and membership

### Destination lookup (B-05)

`POST /v1/places/search` with `{ "query": "Cafe" }` requires authentication and returns `{ "items": [{ "label": "Cafe", "secondaryLabel": "Bengaluru", "latitude": 12.97, "longitude": 77.72, "placeId": "..." }] }`. The query is in the body so it is absent from default URL logs. Queries shorter than 3 or longer than 100 characters return an empty list. The backend uses a provider adapter; currently Geoapify autocomplete is configured with the server-only `GEOAPIFY_API_KEY`. Without a key the endpoint returns `503 PLACE_SEARCH_UNAVAILABLE`, and the client can still place a pin on the map. The provider's `placeId` is opaque; circle creation accepts manually pinned destinations with `placeId: null`.

- One account can be organizer in one circle, mover in another, and anchor in another. `isOrganizer` and `travelRole` belong to a **membership**, not the account.
- `destination` is required and contains `label`, `latitude`, `longitude`, and optional provider `placeId`. `isPrivatePlace` controls whether the anchor role is available.
- `meetupDate` and `meetupTime` are independent nullable fields. `timeZone` is the destination's IANA time zone, derived from coordinates by the server and persisted on creation. An optional client-supplied zone is checked against the derived zone. The client must display that zone where ambiguity matters; never use the viewer's device zone to decide arming.
- `state` is `scheduled`, `active`, or `ended`. `endReason` is null until ended, then `all_arrived`, `organizer_ended`, `cancelled`, or `timeout`.
- `setupStatus` is `pending` or `ready`. A directly added contact appears as pending and receives no live member state. Calling their own role endpoint confirms the role and changes setup to ready. An active mover completes foreground permission first in Flutter; tracking still waits for departure or Share now.
- A public `member.presence` is `not_sharing`, `live`, `in_transit`, `here`, `fixed`, or `frozen`. `pin` is null before a mover begins sharing. An anchor's fixed pin is the destination. A mover changing to anchor stops updates and retains the last public pin as frozen, if one existed. `lastUpdatedAt` lets the client avoid presenting a stale point as live.
- A member's `etaMinutes` is `{ "min": 18, "max": 27 }` or null. An equal min/max is allowed for a schedule-driven single estimate. `leaveByAt` is **never** a field in the shared circle snapshot or shared events; it appears only in the current user's private response.

## Lifecycle and time rules

| Input at creation | Initial state | Target for leave-by |
|---|---|---|
| No date, no time | Active immediately | None |
| No date, time | Active immediately | That time **today** in the circle time zone; the resolved UTC target is stored once and never rolls to tomorrow |
| Future date, no time | Scheduled until that local date starts | None |
| Future date, time | Scheduled until that local date starts | That date and time in the circle time zone |
| Today's date, with or without time | Active immediately | Target only if time is present |

The scheduler arms a dated circle at the start of its local event date. Scheduled circles have no location permission prompt, tracking, route polling, or leave-by jobs. Arming emits `circle.state_changed`; it does not start sharing until each mover departs or taps Share now. The client detects departure locally and sends `start-sharing` with trigger `departure`; the server validates active membership before accepting later location samples. A time-only target already in the past remains today's target; the client may say the target has passed but must not suggest a tomorrow leave-by. Reject a date earlier than today at creation. The organizer may edit date/time while Scheduled; after Active, the date is fixed and the time may be changed. Ended circles are read-only. The private-place flag and destination cannot change after invitations or members are added; broader destination editing requires a separate policy decision before B-05.

Active -> Ended occurs when **at least one ready mover exists** and all ready movers have arrived, when the organizer ends/cancels, or at the configured safety timeout (8–12 hours; exact value set in B-13). A circle with no ready movers does not auto-end as `all_arrived`. Re-evaluate after any role change. End is idempotent. End stops new location ingestion, emits `circle.ended`, and queues prompt deletion of raw GPS samples. Keep only approved summary fields and arrival timestamps. An individual arrival stops that member's sharing immediately, even while the circle remains Active.

## Read models

`GET /v1/circles` returns `{ "items": [CircleSummary...] }` for the authenticated user, including Active, Scheduled, and Ended circles. Summary includes `id`, `destination.label`, `meetupDate`, `meetupTime`, `timeZone`, `state`, `myRole`, `isOrganizer`, and member counts.

```json
{
  "items": [
    {
      "id": "cir_123", "destination": { "label": "Central Cafe" },
      "meetupDate": "2026-09-26", "meetupTime": "18:30",
      "timeZone": "Asia/Kolkata", "state": "active",
      "myRole": "mover", "isOrganizer": false, "memberCount": 2
    }
  ]
}
```

`GET /v1/circles/{circleId}` returns the shared snapshot below only to members. It may include the requester in `members`, but **never includes private leave-by data**. A pending member receives preview-safe data without live pins until setup is complete.

```json
{
  "id": "cir_123",
  "organizerId": "usr_1",
  "destination": { "label": "Central Cafe", "latitude": 28.6315, "longitude": 77.2167, "placeId": "place_123" },
  "isPrivatePlace": false,
  "meetupDate": "2026-09-26",
  "meetupTime": "18:30",
  "timeZone": "Asia/Kolkata",
  "state": "active",
  "endReason": null,
  "revision": 7,
  "members": [
    {
      "userId": "usr_1", "displayName": "Meera", "isOrganizer": true,
      "travelRole": "mover", "setupStatus": "ready", "presence": "here",
      "pin": { "latitude": 28.6315, "longitude": 77.2167 },
      "lastUpdatedAt": "2026-09-26T12:55:00Z", "currentLeg": null,
      "etaMinutes": null, "arrivedAt": "2026-09-26T12:55:00Z"
    },
    {
      "userId": "usr_2", "displayName": "Arjun", "isOrganizer": false,
      "travelRole": "mover", "setupStatus": "ready", "presence": "live",
      "pin": { "latitude": 28.6200, "longitude": 77.2050 },
      "lastUpdatedAt": "2026-09-26T12:57:00Z",
      "currentLeg": { "mode": "transit", "label": "Metro to Central" },
      "etaMinutes": { "min": 18, "max": 27 }, "arrivedAt": null
    }
  ]
}
```

`GET /v1/circles/{circleId}/me` is private to the requester. It returns `{ "travelRole": "mover", "etaMinutes": { "min": 18, "max": 27 }, "leaveByAt": "2026-09-26T12:32:00Z", "arrivalDeltaMinutes": null }`. All three computed fields are null when not applicable; `leaveByAt` and `arrivalDeltaMinutes` are null if no meetup time exists. `arrivalDeltaMinutes` is signed: negative means early, positive means late.

An invitation preview response has no live pins:

```json
{
  "destination": { "label": "Central Cafe", "latitude": 28.6315, "longitude": 77.2167, "placeId": "place_123" },
  "state": "active", "isPrivatePlace": false,
  "memberNames": ["Meera", "Arjun"]
}
```

## Commands and response shapes

Circle create, edit, end, invitation acceptance, and role-edit commands return a `CircleSnapshot` directly. Other successful responses are specified in the table. Repeat actions are idempotent where expected. The API does not trust a user ID sent in the body: `/me` always means the bearer-token owner.

| Method and path | Main request | Success | Authorization / rule |
|---|---|---|---|
| `POST /v1/circles` | `{ "destination": Destination, "isPrivatePlace": false, "meetupDate": null, "meetupTime": "18:30", "timeZone": "Asia/Kolkata" }` | `201` circle snapshot | Signed-in user becomes organizer and mover; role can be changed if private place. |
| `PATCH /v1/circles/{id}` | Partial `meetupDate`, `meetupTime`, `isPrivatePlace` | `200` circle snapshot | Organizer only; lifecycle and private-place edit rules above apply. |
| `POST /v1/circles/{id}/end` | `{ "reason": "organizer_ended" }` or `cancelled` | `200` ended snapshot | Organizer only; repeat returns the ended snapshot. |
| `POST /v1/circles/{id}/invite-links` | `{}` | `201` `{ "url": "https://example.test/join/token", "expiresAt": "..." }` | Organizer only; actual domain decided later. |
| `GET /v1/invitations/{token}/preview` | None | `200` destination, state, member names, `isPrivatePlace`; **no live pins** | Link holder; invalid/expired links do not reveal circle details. |
| `POST /v1/invitations/{token}/accept` | `{ "travelRole": "mover" }` | `200` circle snapshot | Signed-in user; anchor allowed only when `isPrivatePlace`; preview precedes this call in the UI. |
| `PATCH /v1/circles/{id}/me/role` | `{ "travelRole": "anchor" }` | `200` circle snapshot | Member only; mover -> anchor stops future sharing; anchor -> mover requires client permission flow. |
| `POST /v1/circles/{id}/contacts/match` | `{ "contacts": [{ "localId": "c1", "phoneE164": "+919..." }] }` | `200` mapped/unmapped items | Organizer only; names rejected; numbers are compared but not persisted or returned. |
| `POST /v1/circles/{id}/contact-members` | `{ "matchId": "..." }` | `200` circle snapshot | Organizer only; consumes a 15-minute match grant and creates pending membership. |
| `POST /v1/circles/{id}/me/sharing/start` | Location body plus `{ "trigger": "departure" | "manual", "consentGranted": true }` | `200` complete circle snapshot | Active, ready mover only; records the first public point after departure or Share now. |
| `POST /v1/circles/{id}/me/locations` | `{ "consentGranted": true, "latitude": 28.62, "longitude": 77.205, "accuracyMeters": 12, "capturedAt": "..." }` | `200` complete circle snapshot | Active, ready mover whose sharing already started; rejects stale, inaccurate, out-of-order, or impossible samples. |
| `POST /v1/circles/{id}/me/arrival` | `{}` | `200` complete circle snapshot | Active, ready mover only. Marks the requester Here, stops their sharing, stores an arrival summary, and ends the circle when every ready mover has arrived. |
| `GET /v1/circles/{id}/me/route-options` | None | `200` `{ "items": RouteOption[] }` | Active, ready mover with a public pin. Options use server UUIDs and expire after 15 minutes. An empty list is a recoverable no-route result. |
| `PUT /v1/circles/{id}/me/selected-route` | `{ "routeOptionId": "UUID" }` | `200` selected `RouteOption` | Explicit mover choice only; the server rejects forged, foreign, and expired options. Replaces the prior selection and increments the circle revision. |
| `GET /v1/circles/{id}/me/selected-route` | None | `200` saved `RouteOption` or `204` | Restores the current mover's selection. A saved route remains after its suggestion quote expires. |
| `GET /v1/circles/{id}/me` | None | `200` private journey state | Bearer owner only. Returns role, ETA range, private `leaveByAt`, and arrival delta; timing fields are null when not applicable. |

Manual arrival confirmation is available in the MVP. No other member may call another person's `/me` endpoint.

## Real-time snapshots

`GET /v1/circles/{circleId}/events?afterRevision=N` requires authentication and membership. It returns the complete shared snapshot immediately when the stored revision is greater than `N`; otherwise it waits up to 25 seconds and returns `204` if unchanged. Reconnect by sending the last applied revision. Apply only responses with a higher revision.

Mutation use cases publish only the circle ID and revision. The waiting request reloads the authorized snapshot, so the broker never carries phone numbers, auth tokens, raw GPS history, or private leave-by values. Pending viewers receive no public pins, presence, legs, ETA, or arrivals until setup becomes ready. The current process-local broker must be replaced or bridged before multiple API instances are deployed.

The event envelope below is retained as a possible later WebSocket transport shape; the implemented MVP transport returns complete snapshots instead.

On reconnect, fetch `GET /v1/circles/{id}` and `/me`, then apply only events with a higher `revision`. Shared events never contain raw GPS history, home/start points before sharing, leave-by targets, contact phone numbers, or auth tokens.

```json
{
  "circleId": "cir_123",
  "revision": 8,
  "type": "member.eta_changed",
  "occurredAt": "2026-09-26T13:00:00Z",
  "data": { "userId": "usr_2", "etaMinutes": { "min": 22, "max": 31 }, "currentLeg": { "mode": "transit", "label": "Metro to Central" } }
}
```

Event types for v1: `circle.state_changed`, `member.role_changed`, `member.presence_changed`, `member.eta_changed`, `member.arrived`, and `circle.ended`. The server must suppress small ETA changes before emitting push; the stream may still carry a throttled update for the open screen. `member.arrived` triggers a circle push to others.

Push is delivered only to ready peers, never the mover whose state changed. ETA push requires a change of at least five minutes. Delivery claims are persisted per event and device token, so a retry or process restart cannot send the same push twice.

### Mover location sharing

`POST /v1/circles/{circleId}/me/sharing/start` starts public sharing after the client has obtained permission and explicit consent. Its body is `{ "trigger": "departure" | "manual", "consentGranted": true, "latitude": 12.97, "longitude": 77.59, "accuracyMeters": 18, "capturedAt": "2026-10-07T12:00:00Z" }`.

`POST /v1/circles/{circleId}/me/locations` uses the same body without `trigger` for subsequent points. Both return the complete updated shared snapshot. Only an Active circle's ready mover may upload; sharing must already have started for subsequent points. The API rejects absent consent, invalid or inaccurate coordinates, stale/future timestamps, out-of-order samples, arrived members, anchors, and Ended circles. A public Live point older than two minutes is returned as `in_transit` with its last point retained.

## Error envelope

```json
{ "error": { "code": "ROLE_NOT_ALLOWED", "message": "Anchor is available only for a private-place circle.", "details": {} } }
```

Use `400` for malformed input, `401` for missing/invalid auth, `403` for a valid user without permission, `404` for inaccessible circles, `409` for state conflicts or duplicate actions that cannot be treated idempotently, `410` for expired invitations, and `422` for valid-shaped but invalid business values. Keep error `code` stable for client handling; messages are display-safe. The client must handle request failures without guessing that a circle or role change succeeded.

## Decisions still open

- B-05: destination edits after members join and the effect on routes and anchors.
- Automatic proximity arrival detection is deferred until it is proven against physical-device accuracy and battery measurements. The MVP offers explicit member confirmation.
- B-13: exact safety timeout in the specified 8–12 hour range and maximum delay before GPS purge.
- B-02: route-provider live coverage in the pilot city and production deep-link domain. B-04 chose Firebase Phone Authentication; real-device and backend credential integration remain open.
