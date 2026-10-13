# Changelog

All notable changes to AeroGrid 3D are documented here.

## [Unreleased]

### Changed

- Restored keyless regional aircraft using adsb.lol; retained selectable legacy and paid providers with position-age validation.
- Replaced flat cloud sprites with physical ellipsoid volumes and fragment depth, preventing ground intersections in tilted views; removed synthetic HDR flashes while retaining bloom.
- Separated aircraft and satellite trajectory controls and made ISS/Tiangong names obey the label setting.

- Replaced the Cesium globe with a custom three.js renderer: viewport-prioritised imagery quadtree, polar caps, physically based atmosphere, day/night lighting with city lights, MSAA and bloom.
- Google Earth style controls: zoom towards the cursor without drift, Ctrl / Shift / right-drag tilt, Alt-drag rotation, inertia, fly-to and object tracking.
- Moved the search bar to the top centre, replaced the bottom dock with a collapsible sidebar, and made the fullscreen button toggle.
- Tightened the Content Security Policy: scripts no longer need `unsafe-eval`.

### Added

- Cached CelesTrak OMM / SGP4 orbit predictions, GFS cloud altitude profiles, and recent Fintraffic AIS reports and public cameras in Live Beta.
- Private one-hour server connections for optional AISStream and paid RapidAPI keys, with cancellation and cooldown retained across reconnects.
- Coordinate-based registration of public owner-enabled YouTube embeds, source/freshness details, and a sourced setup guide.

- Faceted 3D aircraft, satellite and space-station models with satellite light trails.
- Particle clouds, rain and lightning; Live Beta radar is converted to particles.
- Real Sun, Moon, star catalogue and Milky Way positions.
- 3,244 airports, a NASA Black Marble night map, an overview mini globe, and display settings with quality presets and object limits.
- A larger deterministic satellite constellation and hub-weighted demo traffic across 1,400 routes.

### Removed

- The flat Mercator projection and the Relief style.

## [0.1.0] - 2026-07-16

### Added

- Explicit Global Demo and Live Beta entry experiences.
- Deterministic worldwide Demo with 2,000-aircraft desktop and 800-aircraft mobile limits.
- Regional Live Beta backed by the server-side Airplanes.live point API.
- Aircraft search, selection, tracking, flight metrics, weather controls, and English/Japanese localization.
- Same-origin versioned REST endpoints for status, flights, and weather.
- Desktop and mobile Playwright coverage plus unit and API integration tests.
- Structured request logs, release metadata, health checks, security headers, and production cache policies.

### Changed

- Reframed the product as an aviation-first live 3D atlas with weather as context.
- Replaced the WebSocket, SQLite, direct provider access, and automatic simulation fallback architecture with a single Node service.
- Reduced the production install to the Express runtime dependency tree.
- Reworked desktop controls into compact overlays and mobile controls into a dock and scrollable bottom sheets.

### Removed

- OpenSky as a public live provider pending written licensing.
- Direct CelesTrak access, live satellite rendering, and infrastructure layers from the v1 scope.
- Redis, database history, Gemini configuration, and the legacy Nginx-only container.

### Operational limits

- Live Beta is non-commercial and limited to an on-demand radius of 250 NM.
- Aircraft data uses a 60-second shared cache, one upstream request per second, and a 450-request daily soft limit.
- Provider failures may show the last successful result as stale for up to five minutes; Demo data is never substituted into Live Beta.
- Public providers have no AeroGrid-controlled SLA and remain subject to their own terms.

[0.1.0]: https://github.com/lingmulongtai/AeroGrid-3D/releases/tag/v0.1.0
