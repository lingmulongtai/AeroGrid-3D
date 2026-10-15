# AeroGrid 3D

An aviation-first live 3D atlas: aircraft are the subject, weather is the context.

AeroGrid has two intentionally separate experiences:

- **Global Demo** — a deterministic worldwide simulation for fluid exploration. It never calls a live aircraft endpoint.
- **Live Beta** — real aircraft within an on-demand radius of 1–250 NM. If live data fails, AeroGrid shows a clear unavailable state instead of inserting demo aircraft.

The public beta is designed for non-commercial, low-cost operation without an SLA. Accounts, alerts, history playback, and infrastructure layers remain outside v1. Optional live sources are configured in Display settings.

## Product behavior

- Custom three.js globe renderer: screen-space-error tile quadtree that loads imagery nearest the screen centre first, polar caps, single-scattering atmosphere, real-time day/night terminator with city lights, specular sun glint, MSAA and bloom.
- Accurate sky: the Sun and Moon are positioned with astronomy-engine, and 8,900 real stars from the HYG catalogue plus a procedural Milky Way rotate with sidereal time.
- Map styles: Sentinel-2 cloudless + Esri satellite imagery, an OpenGridWorks-style dark map with navy oceans, and NASA Black Marble night lights.
- Faceted 3D models for airliners, heavies, light aircraft, helicopters, satellites, Starlink-class craft, and space stations; fast objects leave short light trails.
- Weather is rendered as lit cloud and rain particles: simulated cyclones, fronts and thunderstorms in Demo, RainViewer radar converted to particles in Live Beta.
- 1,150 major and 2,094 regional airports (OurAirports) with zoom-dependent markers and labels.
- Google Earth style navigation: drag to pan, wheel to zoom towards the cursor, Ctrl / Shift / right-drag to tilt, Alt-drag to rotate, double-click to fly in, compass to restore north. The overview mini globe shows where you are looking.
- Display settings with Low / Balanced / High / Ultra presets, MSAA, render resolution, imagery sharpness, bloom, trails, and object limits.
- Collapsible sidebar, top-centred search for aircraft, satellites and airports, fullscreen toggle, English and Japanese UI.
- Live source, coverage, update time, freshness, and failure state are always visible.
- The last successful aircraft snapshot may be shown as `STALE` for at most five minutes. It is then removed.
- All live polling stops while the browser tab is hidden. Aircraft auto refresh also pauses after 15 minutes without pointer, key, wheel or touch input; activity or the header's Resume button resumes cache requests while respecting provider cooldowns and shared upstream slots. Pausing does not extend the five-minute stale limit.
- Demo satellites remain simulated; Live Beta uses CelesTrak OMM elements with SGP4 predictions and displays the element epoch. Neither is presented as live telemetry.
- Aircraft and satellite trails have independent layer switches; station names respect the Labels switch.
- Cloud volumes stay above the globe at their modelled altitude, including close tilted views. Live cloud heights come from GFS pressure-level forecasts; rainfall comes from RainViewer, with illustrative rain-column heights.
- Optional regional ships and public still-image cameras use Fintraffic. Global receiver-dependent AISStream and paid ADS-B Exchange are selectable with personal API keys; public YouTube videos can be registered at map coordinates.

![AeroGrid desktop atlas](docs/screenshots/atlas-desktop.png)

## Architecture

One Node service exposes the same-origin REST API and serves the Vite production bundle. Keyed providers are accessed only from the server; AISStream uses a server WebSocket. Imagery, radar PNGs, official camera images and owner-enabled YouTube embeds remain browser resources.

```text
Browser -> Node /api/v1 -> 210 s shared aircraft cache -> adsb.lol / selected provider
                    \-> 10 min weather cache --------> RainViewer
                    \-> 30 min cloud profiles -------> Open-Meteo GFS
                    \-> 2 h persistent OMM cache ----> CelesTrak
                    \-> regional ships / cameras ---> Fintraffic
                    \-> private expiring connection -> AISStream / RapidAPI
        -> Node static files -> Vite bundle
```

Public endpoints:

- `GET /api/v1/status`
- `GET /api/v1/flights?lat={-90..90}&lon={-180..180}&radius_nm={1..250}`
- `GET /api/v1/weather`
- `GET /api/v1/clouds?lat={-90..90}&lon={-180..180}&radius_nm={1..250}`
- `GET /api/v1/satellites?limit={1..5000}` — integer limit, default 1200; invalid values return 400
- `GET /api/v1/ships?lat={-90..90}&lon={-180..180}&radius_nm={1..250}`
- `GET /api/v1/cameras?lat={-90..90}&lon={-180..180}&radius_nm={1..250}`
- `POST /api/v1/connections` / `DELETE /api/v1/connections` — personal one-hour provider sessions; raw keys are never returned

Shared types live in `shared/contracts.ts`, including `AppMode`, `SourceStatus`, and `DataSnapshot<T>`.

Satellite delivery uses the requested quality limit (300 / 1200 / 2400 / 4200), with only the 14 OMM fields required for SGP4, display and validation. Each orbital cache generation has one deterministic order: ISS and Tiangong first, then population-weighted categories with a 2% minimum weight. NORAD interval midpoints spread each category across its catalog number range; larger limits extend the same prefix. This changes the displayed population to include Starlink even at Low quality.

`/api/v1/satellites` overrides the API's default `no-store` with `public, max-age=min(600, seconds until expiresAt)`, clamped to zero. Strong ETags distinguish generation, limit, metadata and encoded bytes; matching validators return 304. Unavailable responses remain `no-store`. JSON and gzip/Brotli representations are memoized in memory for up to 16 recently used limits per generation; the full persistent OMM cache and its refresh/failure policy remain unchanged. API JSON and static text assets support gzip/Brotli; PNG/JPG remain uncompressed. Satellite and camera catalogs ignore unrelated refresh tokens and retain unchanged snapshot references. Cameras now request the loaded area; satellites remain global.

Aircraft requests round the center to a 0.1° grid and round the radius up to the next 5 NM for both upstream requests and shared cache keys. Response coverage and the footer show that normalized radius. Fintraffic ships and cameras retain shared full upstream catalogs (60 seconds / 1 hour), but each API response contains only points within the requested great-circle radius. Requests outside conservative Finnish/Baltic bounds return an empty `reason: outside-coverage` snapshot without contacting Fintraffic; the client also skips those requests and shows Outside coverage. Registered YouTube streams and AISStream are independent of these bounds.

Aircraft share a 210-second cache and upstream admission interval. The shared budget gates different areas and paid sessions too, so changing area, reconnecting or manually refreshing cannot consume consecutive upstream slots. Flight snapshots include `nextRefreshAt` (UTC) and `nextRefreshAfterMs` (relative to server response time); clients prefer the relative delay to avoid browser clock skew and align with an already-populated cache rather than wait another full interval. A paced request with no usable cached data returns empty items and `reason: budget-paced`; the UI shows Waiting. The existing 450/day cap and provider HTTP 429 cooldown remain enforced; longer Retry-After delays take precedence and survive reconnects.

Visible-page polling is normally 210 seconds for aircraft, 60 seconds for weather metadata and ships, 5 minutes for cloud profiles (30-minute server cache), 10 minutes for satellites, and 1 hour for camera catalogs. Returning to the tab updates due layers once, without replaying missed polls. Idle resume/manual area loading may read the shared cache immediately, while provider cooldowns and upstream admission still apply. An unattended aircraft tab makes about 5 requests before the existing 15-minute pause; a tab hidden all day makes none. API polling controls do not alter imagery or video playback.

At most 412 upstream slots fit in one UTC day per continuously running shared budget, leaving 38 below the 450 cap (previously 1,440 one-minute opportunities). Data still become STALE after one minute and disappear after five minutes from the observation timestamp, including initial provider responses and failed updates. Invalid observation times or timestamps over one minute into the future are rejected. The renderer's existing 150-second prediction cap stays in place, so aircraft can stop moving briefly before the next observation. Simultaneous distant areas compete for the same slots and can have gaps. Counters and pacing remain in process memory: separate regions, server instances and restarts are not coordinated by a persistent global quota.

## Data sources and limits

| Data | Source | Runtime policy |
| --- | --- | --- |
| Live aircraft | [adsb.lol](https://www.adsb.lol/docs/open-data/api/) (ODbL) or selected provider | Server-only, 250 NM maximum, normalized 0.1° / 5 NM coverage, 210-second shared cache/admission, 450/day cap, provider pacing and HTTP 429 cooldown retained |
| Live orbit predictions | [CelesTrak OMM](https://celestrak.org/NORAD/documentation/gp-data-formats.php) | Persistent two-hour cache, stop automatic downloads on failure, no synthetic fallback |
| Cloud profiles | [Open-Meteo GFS](https://open-meteo.com/en/docs/gfs-api) (CC BY 4.0) | Regional nine-point pressure-level forecasts, 30-minute cache, ground-level exclusion |
| Ships / cameras | [Fintraffic](https://www.digitraffic.fi/en/terms-of-service/) (CC BY 4.0) | Finnish/Baltic bounds plus requested-radius filtering; shared 60-second / 1-hour catalogs, recent vessel reports only, periodic still images |
| Radar | [RainViewer API](https://www.rainviewer.com/api.html) | Server-only metadata, latest documented PNG frame, 10-minute cache, one metadata refresh after tile failure |
| Demo | AeroGrid deterministic generator | Never presented as live data |
| Imagery | [EOX Sentinel-2 cloudless](https://s2maps.eu/) (CC BY-NC-SA 4.0), [Esri World Imagery and Dark Gray Canvas](https://www.esri.com/), [NASA GIBS Black Marble](https://www.earthdata.nasa.gov/gibs) | Browser tile requests, viewport-prioritised, LRU cache |
| Bundled data | NASA Blue Marble, Black Marble and LRO Moon textures; [HYG star catalogue](https://github.com/astronexus/HYG-Database) (CC BY-SA 4.0); [OurAirports](https://ourairports.com/data/) (public domain) | Served from `public/` |

[OpenSky](https://opensky-network.org/about/terms-of-use) is not enabled. Production satellite downloads require `ORBIT_CACHE_PATH` on persistent storage or a `gs://bucket/object` Cloud Storage location; container-local temporary storage is insufficient. Shared Cloud Storage generation preconditions coordinate refreshes across regions and revisions. Any orbital download failure latches a pause for operator investigation under the [CelesTrak usage policy](https://celestrak.org/usage-policy.php).

See [the source research and key setup guide](docs/DATA_SOURCES.md) for coverage, licensing, free versus paid options, and the distinction between forecasts, orbital predictions and observations. AISStream and paid ADS-B Exchange have not been validated with a user's subscribed key.

Provider availability and terms can change. Review the linked terms before every public release. Attribution is displayed in the application.

## Local development

Requires Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The Vite server proxies `/api` to the Node API on port `4000`. Copy `.env.example` only if you need a different local API port.

## Verification

```bash
npm run lint       # TypeScript
npm test           # unit and API integration tests
npm run test:e2e   # Playwright at 1440x900 and 390x844
npm run build      # client + compiled production server
npm run bench:satellite-payload # before/after sizes from an existing local OMM cache; no network
npm audit
```

`npm run check` runs TypeScript, Vitest, and the full production build. Pull requests run all of the checks above in GitHub Actions, including Playwright.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md). Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Production

Build and run the compiled same-origin service:

```bash
npm ci
npm run build
PORT=8080 npm start
```

The multi-stage `Dockerfile` runs as the unprivileged `node` user and health-checks `/api/v1/status`.

`cloudbuild.yaml` publishes to Artifact Registry and deploys Cloud Run in `asia-northeast1` with scale-to-zero and one maximum instance. Before using it:

1. Create the Artifact Registry repository (default substitution: `aerogrid`).
2. Confirm Cloud Build can push images and deploy Cloud Run.
3. Override `_REPOSITORY` or `_SERVICE` if needed.
4. Create the private `$PROJECT_ID-orbit-cache` Cloud Storage bucket with uniform bucket access and public access prevention. The existing runtime service identity needs object read/write access to this bucket; never download service-account keys into the repo. The deployment sets `ORBIT_CACHE_PATH=gs://$PROJECT_ID-orbit-cache/orbits.json`.
5. Review provider terms, daily request metrics, structured JSON logs, and the degraded source state after deployment.

The existing `us-west1` deployment uses a separate Cloud Build trigger. Its ingress container also needs the same `ORBIT_CACHE_PATH`, session affinity and one maximum instance. Updating only this YAML does not change that trigger's configuration. Deployment verification and the active revisions are recorded in [PR #22](https://github.com/lingmulongtai/AeroGrid-3D/pull/22).

Satellite and NASA Night views include bundled Natural Earth coastlines and country boundaries. Lines become clearer on the unlit side, remain faint in daylight, and fade below 400 km camera altitude before city imagery. Source/version/license are in `public/data/earth-boundaries.LICENSE.md`.

## License

[MIT](LICENSE). Third-party data remains subject to each provider's terms and attribution requirements.
