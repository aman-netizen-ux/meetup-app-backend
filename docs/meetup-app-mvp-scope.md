# Meetup coordination app — MVP scope

## Core concept
A location-sharing app built specifically for the "friends converging from different areas" problem. Unlike generic location-sharing (Life360, WhatsApp live location), it understands multi-modal journeys, computes personalized leave-by times, and tells each person exactly when they need to head out — without anyone waiting around.

---

## MVP (v1) — build this first

### 1. Circle creation
- Organizer creates a "circle" and adds friends (via invite link or contacts)
- Sets a destination — **required at creation in v1** (midpoint suggestion, for circles without one, is a v2 feature — see below)
- **Optional meetup date and time — captured as two independent fields, not one**, with a benefit-first nudge if both are left blank:
  - *"When are you meeting? We'll tell each person exactly when to leave."*
  - Skippable in one tap, no blocking popup
  - If skipped, a soft contextual re-prompt once 2+ members are en route

### 2. Join flow + roles (mover / anchor)
- When someone joins a circle, they see a preview of who's already in it before doing anything else
- Each member self-declares a role — the app never infers this from address-matching or any other signal:
  - **Mover** — heading to the destination. Location sharing is mandatory; gets ETA, leave-by nudges, checkpoint tracking. This is the default role.
  - **Anchor** — the destination is their own place; not traveling. No location sharing required, just sees the shared map, shown as a fixed pin rather than a moving dot. Multiple anchors are allowed (e.g. a couple hosting together)
- The anchor option is only surfaced when relevant: if the organizer flags the destination as "meeting at someone's place" when creating the circle, the join screen offers the anchor choice. For public destinations (cafe, mall, metro station), there's no anchor option — everyone's a mover, no toggle shown
- **Role is editable at any time**, not locked at join, and switching is a lightweight **inline dropdown/popup** anchored to the member's own row (Circle screen, home screen) — not a separate full screen:
  - Anchor → Mover: immediately triggers the location-permission flow (if not already granted) and starts journey tracking / leave-by from that point on
  - Mover → Anchor: stops future location sharing, but freezes their last-known pin on the map rather than removing it abruptly — avoids confusing others who were mid-track

### 3. Circle lifecycle states
A circle moves through distinct states, each with different screens/behavior. In v1, a destination is always required at creation (see section 1), so there's no "choosing spot" state yet — that arrives with midpoint suggestion in v2:
- **Scheduled** (destination + time are set, but it's not the event day yet): shown as a static event card — who's coming, where, when. No permission prompts, no tracking, no leave-by logic runs. Prevents false triggers like someone leaving home today for an unrelated errand ahead of a meetup set for tomorrow
- **Active** (armed on the day of the meetup): the circle "arms" and switches to the live Circle screen — leave-triggered sharing, checkpoints, ETAs, and leave-by nudges all become live from this point
- **It's the date, not the time, that decides Scheduled vs. Active** — time only feeds the leave-by nudge math once a circle is already active:
  - No date and no time set → Active immediately (the true spontaneous "let's coordinate now" case)
  - Date set for a future day (time optional) → Scheduled until that date arrives, then arms — this is the "planning tomorrow's meetup today" case
  - Time set with no date → treated as today implicitly (a bare time naturally means "today"), so it arms immediately with that time driving leave-by nudges
- **Ended**: static summary showing who came and when they arrived; no live data, location trail purged per the retention rule above

### 4. Location sharing with privacy-first activation
- Sharing activates automatically once a member moves outside a small radius (~150m) from their starting point — not the moment they open the app
- Optional manual override: "Share now, even before I leave" for members who want to show they're getting ready
- Sharing stops per-person the moment they individually arrive — no reason to keep broadcasting once their journey is over, even if others haven't arrived yet
- Circle marked "done" once all movers have arrived — this event-driven rule is primary, not a fixed duration
- **Safety-net timeout** (backstop only, not the main mechanism): if a circle sits open abnormally long (~8–12 hrs) with no resolution, auto-expire it
- Once a circle ends (arrival, timeout, or manual end), promptly delete the granular location trail from the backend; lightweight metadata (that the circle existed, who was in it, destination) can be retained if useful, but raw GPS pings should be purged

### 5. Multi-leg journey + ETA
- On starting a journey, fetch multi-modal route options (auto/bike/car/metro/walk legs) from a directions API and let the mover **select which suggested route they're taking** — the app never silently assumes a mode. This matters because several plausible routes can exist for the same trip (e.g. straight auto the whole way vs. auto + metro + walk), and only the mover knows which one they're actually on
- Track progress via **geofenced checkpoints** at each leg's waypoints (e.g. metro station entrance/exit) rather than inferring mode from raw sensor data
- Recompute ETA per leg:
  - Completed legs → actual elapsed time
  - Current leg → live traffic (road) or live schedule (transit)
  - Future legs → historical/scheduled duration for time of day
- Display ETA as a **range**, wider for traffic-dependent legs, tighter for scheduled ones (e.g. "18–27 min" vs. "14 min")

### 6. Circle screen (shared, observational)
- Map view showing all members' live positions relative to the destination
- Per-member row: current leg + mode icon, live ETA
- **Does not show other members' leave-by times** — that's personal, not shared (see below)
- Arrived members shown as "Here" with a distinct status

### 7. Personal leave-by nudge (private, actionable)
- Shown only to you, computed against the circle's meetup time if set
- If no meetup time is set: no leave-by/early-late framing at all — just your own live ETA, since there's nothing to be early or late against
- **Never derive a synthetic "target time" from the slowest member's ETA** — this incorrectly nudges on-time people to leave later just to match a straggler

### 8. Arrival nudges + circle broadcast
- On arrival, mark member green/"Here" on the shared map
- If a meetup time is set: personal nudge like *"You're 8 min early"* (computed as arrival time − meetup time)
- If no meetup time is set: no early/late judgment — just a light social prompt, e.g. *"You've arrived — let the group know?"*
- **Broadcast to the rest of the circle** as an active push notification (not just a passive map-state change) — e.g. *"Meera has arrived"* — so members don't need the app open to know

### 9. Richer live notifications
- Push updates when conditions change mid-journey, not just at fixed checkpoints — e.g. *"Arjun hit traffic, his ETA moved to 27 min"*
- Keep these throttled/meaningful (don't push on every minor fluctuation) — trigger on notable ETA shifts or leg transitions, not continuous small changes

### 10. Battery-efficient, accurate location polling
- Adaptive polling using the phone's motion/activity signal: frequent (~10–15s) while moving, sparse (every couple minutes) while stationary
- Geofence-triggered wake-ups at leg checkpoints (metro entrances/exits etc.) instead of relying purely on continuous polling, so leg transitions are caught reliably even when the interval is sparse
- Proximity-based frequency adjustment — poll tighter as a member nears the destination, since accuracy matters most right when leave-by/arrival decisions are being made
- Treated as a baseline quality bar for v1, not optional — since location accuracy is core to the product's value (ETAs, leave-by, checkpoints all depend on it), this isn't something to defer just to keep battery usage low

---

## Infrastructure / must-exist (not differentiating features, but required for v1 to function)
- **Invite/join flow** — two methods, no separate join-code system:
  - **Contacts**: organizer picks from phone contacts; each contact shows a "mapped" status — on the app (adds straight into the circle) vs. not on the app yet (sends an SMS/WhatsApp invite, joins the circle once they install and accept)
  - **Link**: a deep link per circle, for anyone not in contacts or for dropping the invite into an existing group chat. Opens directly into the join/role screen if the app's installed, or to app-store install → then the join screen if not
- **Ending a circle** — clear stop condition for sharing beyond auto-expire on arrival: manual "end circle" for the organizer, or cancellation if plans fall through
- **GPS-loss fallback** — when a member's signal drops (e.g. underground on the metro), hold their last known position and show an "in transit" state rather than a stale pin that looks live
- **Permission handling** — before triggering the OS-level location permission popup, show the app's own explanation screen first (e.g. *"We use your location to tell you when to leave, and to show your friends how close you are"*), so the ask doesn't feel invasive. Consistent with the privacy-first activation decision above. Triggered again for anyone switching from anchor to mover mid-circle if permission wasn't already granted

---

## Account model
- One app account/identity per person — not separate "organizer" and "member" account types
- Every user can both create circles (as organizer) and join circles created by others, freely and simultaneously
- Roles (organizer/member, mover/anchor) are scoped **per circle**, not per account — the same person can be an organizer in one circle, a plain member in another, and an anchor in a third, all at once
- A user's home screen is a list of their circles (active + past), each showing their role in that specific circle

---

## Explicitly deferred to v2+
- **Midpoint suggestion**: for circles created without a fixed destination
  - Members give a one-time starting-location snapshot (not continuous tracking — that only starts once a destination exists)
  - App computes 2–3 candidate points optimizing for fairness by travel *time* (not raw distance), snapped to real places (cafe, metro station, landmark) rather than empty coordinates
  - **Organizer finalizes the choice** for v1 — no group voting yet, kept simple deliberately
  - Once confirmed, the circle converts into the standard flow — mover/anchor roles, continuous tracking, leave-by nudges all activate exactly as in the fixed-destination case. Midpoint suggestion is purely a different *way to arrive at* a destination, not a separate system
- Group chat / built-in messaging inside the circle
- Historical circles / repeat-meetup templates

---

## Key design decisions already locked in
| Decision | Choice |
|---|---|
| Mode detection | Geofenced checkpoints, not sensor-based activity recognition |
| ETA precision | Ranges, not false-precision single numbers |
| Leave-by visibility | Personal only — never broadcast to the group |
| Target time source | Organizer-set only; never synthesized from the group's slowest member |
| Location sharing default | Activates on leaving; "still at home" is opt-in |
| Mover/anchor role | Self-declared, never inferred; editable at any time |

---

## Tech stack direction
- **Mobile client: Flutter**, not native Kotlin — since the product needs both iOS and Android from day one, one Dart codebase is more pragmatic than native Kotlin (Android-only) or duplicating work across Kotlin + Swift
- Background/continuous location tracking will still need some native platform-specific configuration under Flutter (iOS background modes, Android battery-optimization exemptions) — this doesn't fully disappear with a cross-platform framework, just gets reduced
- Kotlin can still be used server-side (e.g. Spring Boot backend) if there's a personal interest in learning it — just not for the mobile client

---

## Build-vs-buy
- Use an existing multi-modal directions API (e.g. Google Directions API) for route + live traffic/transit data rather than building routing or traffic prediction in-house
- Focus engineering effort on: checkpoint-based leg tracking, personalized leave-by logic, and the circle UI — not on reinventing maps/routing
