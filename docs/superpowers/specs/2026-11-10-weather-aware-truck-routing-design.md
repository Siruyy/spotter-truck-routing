# Weather-Aware Truck Routing: Design

Date: 2026-11-10 · Status: draft for approval

## 1. Intent

This is a take-home assessment for Spotter AI (Full Stack Developer). It is a React + Django web app. A truck driver or dispatcher enters origin, destination, departure time and load weight. The app gets 3 truck routes and samples the forecast along each one at the time the truck will actually be there. It scores each route against the given risk/load rules and recommends one, showing everything on a map with a 0–48 h weather heatmap.

Deliverables: a public GitHub repo, a hosted app at `https://truckroute.siruyy.dev`, and a Loom walkthrough.

Grading weights from the brief:
- 40% routes, weather, risk and recommendation logic
- 40% UI, map and heatmap smoothness/performance
- 15% code quality
- 5% docs and walkthrough

The brief says to put correctness and clarity ahead of extra features.

The owner wants it to feel **production-grade**. The emphasis is **driver-first UX** (glanceable, big targets, dark by default), **correctness**, and **speed**.

### Goals
- Logic matches the brief exactly. Every ambiguity is decided once, documented, and covered by a boundary test.
- Scrubbing the heatmap slider runs at 60 fps with zero network calls.
- A driver can understand the recommendation in about 2 seconds, without reading the map.
- $0 running cost: free tiers or keyless APIs only, and no credit card anywhere.

### Non-goals
- User accounts or auth
- Turn-by-turn navigation
- Hours-of-service (HOS) planning and rest stops
- Multi-stop trips
- Non-US coverage (the weather sources are US-focused)
- Native mobile apps

### Anti-goals
These would count as failure even if the app technically works:
- A janky or stuttering slider, or one that refetches while you drag
- Risk shown by color alone
- Any API key reaching the browser
- Silently wrong units (cm vs in, km/h vs mph, kg vs lb)
- A recommendation with no stated reason

## 2. Constraints

- **Stack:** React frontend and Django backend, as required by the brief.
- **Hosting:** owner's Dokploy server (v0.30.8, IP 178.128.97.151), deployed as a Docker Compose stack with images on `ghcr.io/siruyy/…`, the same pattern as the owner's existing portfolio project.
- **Domain:** `truckroute.siruyy.dev`. DNS for `siruyy.dev` is on Cloudflare (proxied). This needs an A record pointing to the VPS.
- **Third-party services:** all free with no card.
  - TomTom: one key, `TOMTOM_API_KEY`, already in `.env`. It is enabled for Routing, Search, Geocoding and Reverse Geocoding, and was verified working on 2026-11-10.
  - Open-Meteo free API: no key. Non-commercial terms, CC BY 4.0, attribution required. No ads, subscriptions or donations.
  - NWS api.weather.gov: no key. Requires a `User-Agent` with contact info.
  - IEM NEXRAD tiles: public domain.
  - OpenFreeMap basemap: no key. It requires an identifying User-Agent and has no SLA.
- **Secrets:** env vars only. `.env` is git-ignored, and `.env.example` is committed.

## 3. Decided by the owner

- Every feature in §5 is in scope, including the extras: better departure time, NWS alerts, share link, offline last trip.
- Self-host on Dokploy at `truckroute.siruyy.dev`.
- Free services only.
- The stack in §8.

## 4. Driver flow

1. **Plan screen** (landing, no login). Full-bleed map. Bottom sheet on phones (< 768 px), left panel on desktop. Inputs:
   - **Origin**: autocomplete, plus a "use my location" button that reverse-geocodes.
   - **Destination**: autocomplete.
   - **Departure**: quick chips *Now*, *+2 h*, *Tomorrow 6 AM*, and *Custom* (date-time picker). Allowed range is now to now + 48 h.
     - The chips and picker use the **origin's local timezone**, shown as e.g. "6:00 AM CST", because that is the driver's clock at departure. The browser's zone is only a fallback until the origin is set.
     - The origin's timezone comes from the suggest/reverse result. If TomTom doesn't return one, the server looks it up with Open-Meteo `timezone=auto`.
     - `departure_at` is sent in UTC. *Builder's-call note.*
   - **Load weight (lb)**: stepper with presets 10k / 20k / 30k / 40k / 45k. Range 0–50,000. Remembered in localStorage.
   - **Checkpoint spacing**: 10 / 25 / 50 mi segmented control, default 25.
   - **Plan routes** button.
2. **Loading.** Skeleton cards. Route lines draw as soon as the plan responds. The heatmap and alerts load afterwards without blocking.
3. **Verdict card** (top of results). Example: "**Take Route B — via I-35 & I-70.** 0 severe miles · +18 min vs fastest." It gives a one-line reason taken from the first ranking rule that separates B from the runner-up. If every route has No Travel miles, the card turns into a red "No safe route for this departure" with a link to item 7.
4. **Three route cards**, one per route:
   - Letter and colored swatch
   - "via" name
   - ETA (local time at the destination), distance, drive time
   - Severe miles and High miles
   - A **trip strip**: a horizontal bar of the route's risk by mile, with an icon and pattern per level
   - "Recommended" badge on the winner
   - Tapping a card selects that route.
5. **Checkpoint timeline** for the selected route. One row per checkpoint:
   - Mile marker
   - Local ETA with timezone abbreviation
   - Risk level chip (icon + text)
   - The driving factor (for example "Wind 38 mph")
   - Expandable to show all values: wind, gust, rain, snow, temp, visibility, weather code
   - Tapping a row flies the map to that checkpoint and opens its popup. The reverse also works: tapping a marker scrolls the list to its row.
6. **Forecast slider (0–48 h)**:
   - Labelled in clock time ("Tue 3 PM"), snapped to whole hours, but the visuals crossfade smoothly between hours.
   - ±1 h and ±6 h step buttons and a play/pause button. Nothing plays automatically.
   - A layer picker: **Risk** (load-adjusted) / Wind / Rain / Snow.
   - A **truck marker** shows where the selected route's truck will be at the slider time. It is hidden before departure and after arrival.
   - **Axis:** the slider always spans the brief's 0–48 h from the current hour. Labels use the origin's timezone, or the browser's before a trip exists.
     - Parts of a trip that fall after now + 48 h still get checkpoint risk, because those are fetched to cover the full ETA range. They are not on the heatmap.
     - The truck marker shows "beyond forecast window" for those times.
     - *Builder's-call note: this keeps the heatmap payload fixed at 49 frames.*
   - The slider stays usable before any trip is planned. It then shows the heatmap for the map viewport. See §6.6.
7. **Better departure time.** Re-score the same 3 routes for departure offsets of +1, +2, +4, +6 and +12 h using already-cached forecasts. This needs no new routing call (see §6.7). Only offer a time when it strictly improves the recommendation ranking. Example: "Leave at 2 PM → 0 severe miles (was 34)." One tap re-plans with that departure.
8. **NWS alerts banner.** Shows active official alerts (event, severity, expiry) that intersect any checkpoint of any route. Tapping a list item shows each alert's headline and which routes and checkpoints it affects.
9. **Share link.** A "Share" button saves a snapshot and copies `https://truckroute.siruyy.dev/t/{slug}`. The shared view shows the snapshot read-only with an "as of" timestamp, plus a "Re-plan with latest forecast" button.
10. **Installable PWA and offline last trip.** The app shell is precached. The last plan, heatmap payload and alerts are persisted in IndexedDB. Offline, the app shows the last trip with an "Offline — data as of …" banner. Basemap tiles may be missing offline. That is acceptable and the UI says so.
11. **Optional observed-radar overlay.** A toggle for IEM NEXRAD "Observed radar (now)". It is visibly separate from the forecast slider and hidden when the slider is not at "now".

### Driver UI rules
- Dark theme by default, with a light toggle. Text contrast at least 4.5:1. Body text at least 16 px.
- Tap targets at least 48 px with at least 8 px spacing. The slider thumb is at least 48 px.
- Risk is never shown by color alone. Each level has an icon, a text label, and a line dash pattern on the map.
- Use a colorblind-safe ordered ramp that avoids a red/green pair. The exact palette is left to the builder, but it must be checked against deuteranopia and protanopia simulation.
- Respect `prefers-reduced-motion`.
- A footer note states the app is for pre-trip planning and should not be used while driving (FMCSA §392.80/.82).
- Imperial units throughout. Times are shown in each checkpoint's local timezone.

## 5. Feature list

| # | Feature | Notes |
|---|---|---|
| F1 | Address autocomplete and reverse geocode | TomTom Search, proxied through Django |
| F2 | 3 truck routes | TomTom Routing, truck mode, plus a fallback when fewer than 3 come back (§6.2) |
| F3 | Checkpoint sampling every 10/25/50 mi with ETA | §6.3 |
| F4 | Forecast at each checkpoint at its ETA | Open-Meteo hourly (§6.4) |
| F5 | Risk classification with load rules | §6.5 |
| F6 | Route scoring and recommendation with a reason | §6.6 |
| F7 | Map: routes colored and dashed by risk, checkpoint markers and popups, route selection | |
| F8 | Corridor heatmap with a 0–48 h slider and layer picker | §6.8 |
| F9 | Truck-position marker tied to the slider | |
| F10 | Better departure time | §6.7 |
| F11 | NWS alerts along routes | §6.9 |
| F12 | Share link | Postgres snapshot |
| F13 | PWA and offline last trip | |
| F14 | Observed radar overlay | Optional, toggle off by default |
| F15 | Attribution and pre-trip-planning disclaimer | |

## 6. Logic: the decided rules

Everything in this section is a decision. The README repeats each one under "Assumptions".

### 6.1 Units and weights
- **Load weight input:** lb, 0–50,000. It drives the risk load rules.
- **TomTom `vehicleWeight`:** this is gross weight in kg. Compute `(load_lb + TARE_LB) × 0.45359237`, with `TARE_LB = 35,000` (configurable env var). *Builder's-call note: the brief says "load weight", so the load rules use the entered load; routing needs the gross weight.*
- Also send `vehicleCommercial=true`, `travelMode=truck`, `traffic=true`, and `departAt` set to the user's departure time in UTC.
- Distances are miles internally (1 mi = 1609.344 m). Wind is mph. Precipitation is in/hr.

### 6.2 Routes (F2)
1. Request `maxAlternatives=5` with `routeType=fastest`. On 2026-11-10, Dallas → Denver returned only 2 routes for `maxAlternatives=2`, so expect fewer than 3.
2. **Dedupe:** drop any route sharing more than 80% of its length with an already-kept route. Use a sampled point overlap within 200 m.
3. **If fewer than 3 remain:**
   - Generate forced alternatives. Put a single via waypoint at the primary route's midpoint, offset perpendicular to the origin→destination line to the left, then to the right.
   - The offset distance is `clamp(0.15 × straight-line distance, 25 mi, 120 mi)`.
   - Snap each via point to a road (TomTom routes do this implicitly).
   - Keep a result only if (a) its duration is at most 1.5 × the primary's, and (b) it passes dedupe. Try a second offset at 0.3× if needed.
4. If still fewer than 3, return what exists. The UI shows "Only N distinct routes found" and that is not an error.
5. **Labelling:** sort kept routes by travel time and label them A/B/C. Name each one "via X & Y" from the two road numbers covering the most distance, taken from guidance instructions. If no road numbers exist, use "Route A".
6. **Geometry and timing:** request guidance (`instructionsType=coded`) to get cumulative `routeOffsetInMeters` / `travelTimeInSeconds` per instruction. Build a monotone distance→time function by piecewise-linear interpolation between instruction points over the full polyline. *The builder must verify the exact TomTom response fields against a live call and record a fixture.*

### 6.3 Checkpoints (F3)
- Checkpoints go at mile 0 (origin), every N miles (N = 10, 25 or 50), and at the destination. If the last regular checkpoint is less than N/2 miles from the destination, drop it so the final segment isn't tiny.
- **ETA** = departure time + interpolated travel time at that distance.
- **Mileage ownership:** each checkpoint owns half of the segment before it and half of the segment after it. The origin and destination own one half-segment each. So the sum of owned miles equals the route length exactly. This drives "Severe miles", "High miles" and the average.
- Changing the spacing re-samples on the server using the cached route and forecast. It needs no new routing call.

### 6.4 Weather at a checkpoint (F4)
- **Source:** Open-Meteo `/v1/forecast` with:
  - `hourly=wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m,visibility,weather_code`
  - `wind_speed_unit=mph`, `precipitation_unit=inch`, `timezone=GMT`, and `models=best_match`
  - `forecast_hours` set to cover the latest ETA across all routes and departure offsets, plus 1. Cap it at 16 days.
  - Batch at most 200 locations per request.
  - *Builder's-call note: `best_match` avoids depending on HRRR, which Open-Meteo says will be discontinued end of Nov 2026.*
- **Timezone per location:** a separate cheap request with `timezone=auto` and `forecast_hours=1`, or the builder's equivalent. It is used only to label local times. It is cached by the 0.1° cell for 30 days.
- **Rates:** Open-Meteo hourly `rain`, `showers` and `snowfall` are sums over the *preceding* hour, so each one is already an in/hr rate.
  - Rain rate = `rain + showers`.
  - Snow rate = `snowfall` (new-snow depth, in/hr).
- **Time alignment:** for an ETA `t`, use the hourly row stamped `ceil_to_hour(t)` (the hour containing `t`). Wind uses the same row.
- **Wind:** the risk rule uses **sustained wind** `wind_speed_10m`. Gusts are displayed. A gust of 55 mph or more adds a "Gusts ≥ 55 mph" advisory chip but does not change the level. *Builder's-call note: the brief says "wind". Sustained is the conventional reading, and using gusts would mark much of the country Moderate.*
- **Cache:** coordinates are snapped to a **0.1° lattice** (about 11 km), shared by checkpoints *and* heatmap grid points, so overlapping routes and the grid dedupe to the same cells. Key `fc:om:{lat}:{lon}`. The value is the full hourly array plus its fetch time. TTL is 120 min.
  - **Quota budget:** Open-Meteo counts each location as one call, against 10k/day and 600/min free. A typical 1,000-mile plan at 25 mi spacing is about 120 unique cells plus at most 300 heatmap cells, and much less on repeats. Expect roughly 25+ fresh plans/day and unlimited cached ones.
  - Track the daily count in Redis. When the count passes 9,000/day or a 429 comes back, switch checkpoints to the NWS provider and set the heatmap to "temporarily unavailable" (no NWS heatmap).
  - Concurrent requests for the same cell are coalesced.
  - On 429 or 5xx, serve stale data if present and mark the response `stale_as_of`.
- **Provider interface** `ForecastProvider`. Open-Meteo is the default, and NWS gridpoints is an implemented fallback selected by `FORECAST_PROVIDER=nws`.
  - The NWS version converts km/h → mph and mm → in.
  - It spreads 6-hour QPF and snowfall amounts evenly per hour, and the UI labels these as "6 h average rate".

### 6.5 Risk classification (F5)
Levels are ordinal: `LOW=0, MODERATE=1, HIGH=2, SEVERE=3, NO_TRAVEL=4`. There is also `UNKNOWN` for an ETA beyond forecast coverage or a missing value.

**Boundary rule:** each band includes its lower bound and excludes its upper bound. The exceptions are where the brief's wording says otherwise, as in the rain and snow top bands.

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind (mph) | < 25 | 25 ≤ w < 35 | 35 ≤ w < 45 | 45 ≤ w < 55 | ≥ 55 |
| Rain (in/hr) | < 0.10 | 0.10 ≤ r < 0.25 | 0.25 ≤ r < 0.50 | 0.50 ≤ r ≤ 1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5 ≤ s < 1.0 | 1.0 ≤ s < 2.0 | 2.0 ≤ s ≤ 3.0 | > 3.0 |

The brief writes wind bands as integers ("25–34"), so 34.6 mph counts as Moderate. Wind values are not rounded before classification.

**Load rules** apply to the wind level only, after the table:
- Wind ≥ 55 → NO_TRAVEL for any load (already in the table).
- 45 ≤ wind < 55 and load > 30,000 lb → NO_TRAVEL.
- 35 ≤ wind < 45 and load > 40,000 lb → SEVERE.
- "Greater than" is strict, so exactly 30,000 or 40,000 lb does not trigger.

**Checkpoint level** = max(wind level after load rules, rain level, snow level). The **driving factor** is the condition that produced the max. On a tie, the order is wind > snow > rain.

**Tests:** a table-driven test at every boundary value (24.99, 25, 34.99, 35, …, 1.00, 1.0001, 3.0, 3.0001). It covers both load thresholds exactly at, and just above, 30k and 40k.

### 6.6 Scoring and recommendation (F6)
Per route:
- `no_travel_mi`, `severe_mi`, `high_mi`, `moderate_mi`, `low_mi`, `unknown_mi`, all from owned miles
- `avg_risk` = distance-weighted mean of the level (0–4) over known miles
- `duration_s`

**Ranking key**, ascending: `(no_travel_mi, severe_mi, high_mi, avg_risk, duration_s)`.
- Miles are compared after rounding to 0.1 mi, and `avg_risk` to 0.01, so float noise can't decide.
- *Builder's-call note: the brief's list omits No Travel. It is ranked first because it is strictly worse than Severe.*

The **reason** string comes from the first key component where the winner beats the runner-up. Examples:
- "Fewest severe-weather miles (0 vs 34)"
- "Same severe and high miles; lower average risk (0.4 vs 0.9)"
- "Equal risk; fastest (11 h 52 m)"

If any route has `unknown_mi > 0`, show a "Forecast coverage incomplete" note on it.

### 6.7 Better departure time (F10)
- For each offset in {+1, +2, +4, +6, +12} h, shift every checkpoint ETA by the offset. Route durations are reused from the original TomTom call. *Note: traffic differences across offsets are ignored, and the UI says so.*
- Re-classify from the cached forecasts and re-rank.
- Suggest the offset whose best route has the best risk ranking key (earliest on ties), provided it is strictly better than the current recommendation. Only the risk components count, not duration.
- Offsets are skipped if the new departure goes past now + 48 h.

### 6.8 Corridor heatmap (F8)
- **Grid:** start from the union bounding box of all routes, padded 0.5°. Grid spacing is chosen so that at most **300** points lie within 60 mi of any route (corridor mask). Points lie on the 0.1° cache lattice, at a minimum spacing of 0.1°.
  - The heatmap is fetched **only when its panel or layer is visible**. It is open by default on desktop and opens on demand on phones.
  - Forecast hours run 0–48 from the current UTC hour.
  - Each point gets wind, rain, snow, and a risk level computed with the trip's load weight.
- **Payload:** one compact JSON. Points are `[lat, lon]`, and per layer there is a flat `Uint8`/`Float32`-friendly array of size `points × 49`, base64-encoded typed arrays or plain arrays (builder's choice). Target under 300 KB gzipped.
- **No trip yet:** before a plan exists, a viewport grid (same cap) is fetched for the map's visible area. It is debounced 600 ms after the map stops moving, with no load rules applied. The load weight is used once it has been entered.
- **Rendering:**
  - A Web Worker interpolates each hour (IDW, k = 6 nearest) into a ~256×256 RGBA raster over the bbox. It applies the layer's color ramp and returns 49 `ImageBitmap`s. Bake per layer, lazily, current layer first.
  - deck.gl `BitmapLayer` ×2 (hour h and h+1), with the top layer's opacity set to the fraction.
  - Slider state lives in Zustand and updates via rAF, not through React re-renders of the panel.
  - Rendered in interleaved mode, below basemap labels and route lines.
  - The color legend is fixed (not viewport-relative).
- **Acceptance:** on a mid-range laptop (Chrome), scrubbing holds 60 fps with no network requests (checked in DevTools). Switching layers shows the first frame in under 300 ms.

### 6.9 NWS alerts (F11)
- Call `GET /alerts/active?point={lat},{lon}` for unique 0.1° cells across all route checkpoints. Use a semaphore of 4 concurrent requests and a 3 min TTL cache.
- Merge by alert `id`. Map each alert to the routes and checkpoints whose cells hit it.
- Show only `actual` status and the `Extreme`/`Severe`/`Moderate` severities.
- Alerts are informational. They **do not change** the computed risk levels; the brief's rules stay the single source of the recommendation. The banner says that.
- The `User-Agent` is `TruckRoute/1.0 (+https://github.com/Siruyy/spotter-truck-routing)`, from the env var `NWS_USER_AGENT`.

## 7. API (Django Ninja, async)

All routes are under `/api`. Inputs are validated with pydantic, and errors use one JSON shape `{error: {code, message}}`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/geocode/suggest?q=&lat=&lon=` | Autocomplete, US only. Cached 24 h. The client debounces 250 ms. |
| GET | `/api/geocode/reverse?lat=&lon=` | Reverse geocode |
| POST | `/api/plans` | Body: origin `{label, lat, lon}`, destination, `departure_at` (ISO, UTC), `load_lb`, `interval_mi`. Returns `plan_id`, routes (geometry, labels, summary, checkpoints with weather and level, scores), recommendation and reason, departure suggestion, `stale_as_of?`. Stored in Redis for 6 h. |
| GET | `/api/plans/{id}?interval_mi=` | Re-sample at a new spacing from cached data |
| GET | `/api/plans/{id}/heatmap` | Corridor grid payload (§6.8) |
| GET | `/api/heatmap?bbox=&load_lb=` | Viewport grid, used before a plan exists |
| GET | `/api/plans/{id}/alerts` | NWS alerts mapped to routes |
| POST | `/api/plans/{id}/share` | Persist a snapshot to Postgres and return `slug` (10-char random) |
| GET | `/api/shared/{slug}` | Snapshot |
| GET | `/api/health` | Liveness, plus whether Redis and Postgres respond |
| — | `/radar/{z}/{x}/{y}.png` | Nginx caching proxy to IEM, 5 min cache |

**Abuse protection:** per-IP rate limits in Redis on `POST /api/plans` (10/min) and on suggest (60/min). Nginx `limit_req` sits in front as well. The purpose is to protect the TomTom and Open-Meteo quotas.
- The client IP is read from `CF-Connecting-IP`, trusted only behind Cloudflare/Traefik. Otherwise every visitor would share one rate-limit bucket.
- TomTom calls are counted daily in Redis. Past 2,000/day, new plans return a friendly "daily demo limit reached" error, while cached and shared plans keep working.

## 8. Tech stack

**Frontend**
- React 19, Vite 8, TypeScript strict
- TanStack Query 5 for server state and IndexedDB persistence
- Zustand 5 for UI state: selected route, slider hour, layer, theme
- Tailwind 4 and shadcn/ui
- `vite-plugin-pwa` 2
- MapLibre GL 6 via `@vis.gl/react-maplibre` 8
- deck.gl 9.4 with `@deck.gl/maplibre` `MapLibreOverlay` (interleaved)
- OpenFreeMap styles: `dark` and `liberty` (light)

**Backend**
- Python 3.13, uv
- Django 5.2 LTS, Django Ninja (async)
- httpx `AsyncClient` with timeouts, retries on 5xx/429 with backoff, and per-host semaphores
- Redis for cache, plan store and rate limits
- Postgres 17 for share snapshots only
- Served with gunicorn and uvicorn workers

**Code layout**
- `backend/` holds the Django project `config` and these apps:
  - `geo`: TomTom search
  - `routing`: TomTom routing, alternatives, polyline/ETA utils
  - `weather`: providers and cache
  - `risk`: pure classification and scoring, no I/O
  - `plans`: orchestration, API, share model
  - `alerts`
- `frontend/`
- `deploy/` holds compose, nginx and the GitHub Actions workflow
- `docs/`

**Testing**
- **Backend (pytest):**
  - `risk` has 100% branch coverage, including the boundary table.
  - Unit tests for checkpoint sampling, ownership miles, ETA interpolation, dedupe, ranking and reason text.
  - Provider adapters are tested against recorded real fixtures with `respx`.
  - Target: 80%+ overall.
- **Frontend:** Vitest for pure utils (IDW bake, formatting, time math). One Playwright smoke test (plan a trip against fixture API responses and scrub the slider).

**Deploy**
- GitHub Actions builds `ghcr.io/siruyy/spotter-truck-routing-web` (nginx with the built SPA, proxying `/api` and `/radar`) and `…-api`, on push to `main`.
- The Dokploy Compose stack has four services: `web`, `api`, `redis`, `postgres`.
- Domain `truckroute.siruyy.dev` is routed via Dokploy/Traefik with TLS. The builder should copy the portfolio project's compose and domain setup.
  - Claude has Dokploy MCP access and reads the portfolio compose (`composeId -I3h53X1Eon7nXPYi68_w`) to mirror it.
  - Images are public on ghcr, because the repo is public, so no registry credentials are needed.
  - Before going live, check the Cloudflare SSL mode for `siruyy.dev`. It must be Full or Full (strict) to avoid redirect loops; it presumably already is, since the portfolio is served the same way.
  - Redeploy happens on push via a Dokploy webhook called from the GitHub Action.
- Env vars: `TOMTOM_API_KEY`, `DJANGO_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `NWS_USER_AGENT`, `FORECAST_PROVIDER`, `TARE_LB`, `ALLOWED_HOSTS`.

**Security**
- No key reaches the client.
- Same origin, so there is no CORS.
- Django `SECURE_*` settings. CSP limited to self plus the tile hosts: OpenFreeMap and the IEM proxy.
- Postgres and Redis are not exposed publicly.
- Inputs are validated: lat/lon ranges, load range, departure window, and interval enum.

## 9. Docs and walkthrough
- **README:** what it does, a live link, a screenshot/GIF, an architecture diagram, local setup (`docker compose up`), env vars, the full **Assumptions** list from §6, data sources and attributions, known limits, and the test command.
- **Loom outline (5–8 min):**
  1. Plan a real winter route.
  2. Explain the verdict.
  3. Scrub the slider (show DevTools: no network calls).
  4. Show better departure time and the alerts.
  5. Code tour of `risk/` and its boundary tests.
  6. Deploy pipeline.

## 10. Left to the builder
- Exact color palette, provided it passes the colorblind check
- Copy text
- Icons (lucide)
- Animation details
- Grid IDW tuning
- The payload encoding
- Exact TomTom field parsing, verified against live fixtures
- Component structure
- Retry/backoff numbers
- Whether the viewport heatmap shares code with the corridor heatmap

## 11. Outward-facing steps (need the owner's go-ahead)
- **GitHub:** create the public repo `github.com/Siruyy/spotter-truck-routing` and push to it.
- **DNS:** add `A truckroute → 178.128.97.151` (proxied) in Cloudflare via the Cloudflare connector.
- **Dokploy:** create the "Spotter Truck Routing" project and Compose stack, set its env vars (including `TOMTOM_API_KEY`) and deploy.
