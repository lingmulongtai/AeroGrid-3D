# Satellite frame benchmark

Run `npm run bench:satellites` on Node 22 or newer. Vitest uses its Node
environment to handle astronomy-engine's module interop. The benchmark is not
part of `npm test`.

The comparison extracts both original satellite modules from immutable commit
`643e0e375cf7bb834458b0da7410fd674ad04daa` into ignored `.cache/satellite-bench/`.
The baseline and current renderer use identical catalog order, simulation times,
camera height (18,000 km), 16 ms frame steps, 420 warm-up frames and 60 measured
frames. Seven simulated seconds allow progressive history caches to fill before
measurement. Setup/OMM parsing and GPU rendering are outside the timing; the
measured operation is `SatelliteLayer.update()` including frame preparation,
instance matrices, picking positions and trails. No satellite is selected in the
timing scenarios; selection/follow propagation budgets are covered by unit tests.

CelesTrak's active OMM group is downloaded at most once in two hours, reusing the
benchmark cache or the application's fresh cache. A failed request leaves a latch
instead of retrying; offline/paused runs use deterministic synthetic OMM with
53/97-degree LEO, MEO navigation, GEO and eccentric HEO (25% deep-space). Set
`SATELLITE_BENCH_SYNTHETIC=1` to force that dataset. Catalogs and machine-local
results are ignored; the result JSON identifies the dataset, time and all cases.
Do not delete the request latch to bypass CelesTrak's refresh interval.

## Implementation and limits

Live samples retain the previous WGS84 geodetic latitude/altitude projected onto
the spherical globe. One numerical GMST per frame is shared by direct `sgp4`
samples; time offsets use the same cubic GMST polynomial as satellite.js. Demo
GAST remains separate. One-second world-position anchors have evenly phased
round-robin deadlines; orientation uses the anchor difference. Follow is prepared
before camera controls, and drawing/picking/labels share the same double-precision
position. Clock rollback holds the last frame; a pause of one second or more
reinitializes anchors immediately to avoid stale extrapolation.

Each recent trail has a double-precision world-coordinate ring on an absolute
time grid, with the next grid point prepared early. Live history computation is
limited to ceil(N/24) samples per frame. Initial live trails extend over approximately
five to six seconds at 60 fps as their history fills, while models are positioned
immediately. The same bounded fill applies after a long pause or re-enabling old
live trails. Analytic demo history is prepared fully on its first display, with
no progressive fill. Geometry is written relative to the current floating origin
from cached world points, with its head attached to the interpolated model every frame.
Selected orbit geometry refreshes every ten seconds or on a selection change;
only its head and origin translation change in between.
Identical OMM polls retain their anchors/history and GPU buffers; a changed
catalog, including changed elements under the same NORAD ID, invalidates them.

The cold first frame/resume still computes two anchors per satellite, and selecting
an orbit computes 257 points. These one-off costs are outside the steady-state
goal. The regression test includes cold anchors, history fill, follow and initial
selection in its 60-frame average: 2N/60 + 0.016N + ceil(N/24) + 257/60 is about
223 calls/frame for N=2400, below the 240-call cap. Subsequent ordinary 16 ms
frames are capped at 140 calls during fill, with no history-boundary spikes.

Timing is hardware-dependent. Automated precision tests compare against the
independent original `propagate(Date)`/WGS84 path, including actual HEO perigee,
keyframe boundaries, pauses, clock rollback, origin moves and OMM replacement.
Browser/GPU frame time is a separate measurement from this Node CPU benchmark.

## Recorded comparison

Windows, Node v22.20.0, CelesTrak active downloaded once and then read from the
local two-hour cache. Same catalog and time window for each before/after pair;
the 2400-record live selection contains 659 deep-space records. These are Node
CPU timings, not a remeasurement of the reported 74.9 ms browser baseline.
Absolute times depend on machine load; the SGP4-count regression is independent
of timing. Values are mean milliseconds per frame, before → after.

| Satellites | Demo, trails on | Live, trails off | Live, trails on |
| ---: | ---: | ---: | ---: |
| 300 | 1.200 → 0.447 | 5.554 → 0.285 | 27.495 → 0.654 |
| 1200 | 10.373 → 2.976 | 23.152 → 1.243 | 36.584 → 3.706 |
| 2400 | 8.893 → 4.346 | 22.173 → 1.274 | 65.862 → 2.733 |
| 4200 | 16.595 → 5.469 | 78.386 → 5.419 | 191.953 → 18.367 |

Live with trails improves by 42.07× / 9.87× / 24.10× / 10.45× respectively,
exceeding the 5× target in all four populations. The full JSON, catalog and
extracted baseline remain local and ignored.
