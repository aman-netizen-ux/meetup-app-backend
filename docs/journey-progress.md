# B-11 journey progress and ETA assumptions

Journey progress is calculated only after a mover explicitly selects a server-owned route. Accepted location samples are matched to the closest point on the selected provider polyline. The closest passed mode-transition checkpoint determines the current leg. A route change clears the previous ETA and private leave-by value until the next accepted sample is evaluated against the new geometry.

## ETA range

The baseline remaining duration is the provider duration multiplied by the remaining polyline-distance fraction. Distance from the live point back to its closest route point is included, and the ratio is capped at 1.5 so a temporary GPS jump does not create an unbounded estimate. The API returns a range rather than a single promise:

| Current mode | Range around baseline | Reason |
|---|---:|---|
| Walking | 90%–120% | Walking speed and crossings vary. |
| Road | 85%–135% | Geoapify uses approximated traffic, not live congestion. |
| Estimated public transport | 80%–140% | The provider response has no guaranteed current schedule, platform, or service status. |

These ranges are product estimates. They must not be described as live traffic or schedule predictions. A future provider adapter can supply stronger data without changing the application contract.

## Leave-by privacy

`leaveByAt` is calculated only when the circle has an organizer-set meetup time. It subtracts the slower end of the ETA range from the stored target instant. It is saved in `member_live_state` and returned only by `GET /v1/circles/{id}/me` to that bearer-token owner. Shared circle snapshots and long-poll responses contain the ETA range and current leg but never contain leave-by data.

Without a meetup time, ETA remains a personal travel estimate and leave-by plus early/late fields remain null. Arrival delta uses the persisted arrival and target instants and therefore also remains null for an untimed circle.
