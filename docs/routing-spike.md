# B-02 routing spike: Bengaluru pilot

**Status:** preparation complete; live provider responses not tested. Pilot area supplied by user: Ramagondanahalli, Bengaluru, Karnataka. Google Maps Platform Routes API `computeRoutes` was deferred on 2026-10-02 because its India billing account required a refundable ₹3,000 activation prepayment. Geoapify is configured for autocomplete, but it is not selected for routing until this spike proves walking, road, transit, and traffic coverage. Keep every provider key in local `.env` or a secret manager, never in Git or Flutter code. [Routes API setup and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

## Why this pilot matters

We need actual route responses for journeys near Ramagondanahalli to learn whether metro/bus stops, walking connectors, driving traffic, and alternative routes are detailed enough for selected-route checkpoints and ETA ranges. Provider coverage and transit details must be observed rather than assumed. The first test destinations can be Whitefield (Kadugodi) Metro Station and MG Road Metro Station; confirm precise places and add a real meetup destination before evaluating quality.

## Candidate API findings from official documentation

- `computeRoutes` supports `DRIVE`, `BICYCLE`, `WALK`, `TWO_WHEELER`, and `TRANSIT`; there is **no distinct auto-rickshaw mode**. If the user chooses an auto, a driving route may be only an approximation and must be labelled honestly. Walking/bicycling/two-wheeler route warnings required by the provider must be shown when those routes are presented. [Travel mode reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode).
- A `TRANSIT` route can contain walking and transit steps with stop details, but it cannot take intermediate waypoints and does not support the same traffic options as driving. The scope's **auto + metro + walk** example may require composing more than one provider request; test this before promising that exact suggestion. [Transit route guide](https://developers.google.com/maps/documentation/routes/transit-route).
- Request only the needed fields with `X-Goog-FieldMask`; wildcard requests can add cost and latency. [Field-mask guide](https://developers.google.com/maps/documentation/routes/choose_fields).
- Compute Routes is billed per request, with different billing tiers depending on requested features. Set a small development quota before live tests. [Usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

## Live test matrix

| Origin -> destination | Modes to request | What to inspect |
|---|---|---|
| Ramagondanahalli -> Whitefield (Kadugodi) Metro Station | WALK, DRIVE, TRANSIT | Short-trip coverage, station waypoint precision, walking duration, traffic divergence. |
| Ramagondanahalli -> MG Road Metro Station | DRIVE, TRANSIT | Multi-leg transit, line/stop details, transfer points, alternative routes, scheduled versus live information. |
| Real friend origin -> real meetup place (choose with user) | WALK, DRIVE, TRANSIT where applicable | Whether suggestions are actually plausible and usable for leave-by. |

For each request, record response availability, route count, step modes, stop coordinates, scheduled times, provider ETA, call latency, response size, and billable feature tier. Repeat road/transit requests at different times of day. Save sanitized sample responses only; remove home coordinates, API keys, and personal information.

## Request template

Use `POST https://routes.googleapis.com/directions/v2:computeRoutes` with `X-Goog-Api-Key` from the local environment and a narrow `X-Goog-FieldMask`. Example for a transit test:

```json
{
  "origin": { "address": "Ramagondanahalli, Bengaluru, Karnataka, India" },
  "destination": { "address": "MG Road Metro Station, Bengaluru, Karnataka, India" },
  "travelMode": "TRANSIT",
  "computeAlternativeRoutes": true
}
```

Initial field mask: `routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.duration,routes.legs.steps.startLocation,routes.legs.steps.endLocation,routes.legs.steps.transitDetails`. Use a separate `DRIVE` request with `routingPreference: TRAFFIC_AWARE` and a separate `WALK` request. Verify field availability and billing tier with live responses before finalizing the backend adapter.

## Exit criteria

B-02 is done only after real responses for the matrix are reviewed, sanitized samples and observed gaps are recorded, route/leg fields are mapped to the B-01 contract, and the provider/cost choice is documented. Until then, no auto-rickshaw ETA or live transit accuracy claim should be made.
