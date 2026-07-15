# Product baseline

## Repository baseline

- Preserved branch: `master@3a98216`
- Product source baseline: `origin/main@4f128b1`
- Implementation branch: `codex/product-foundation`
- The two original branches had no common ancestor and were not merged.

## Pre-implementation verification

The original `main` passed TypeScript and production build checks, but had no automated tests or CI. Its production bundle included approximately 821 kB of vendor JavaScript and 344 kB of deck.gl JavaScript before gzip.

Browser inspection found:

- overlapping desktop controls and persistent large sidebars competing with the globe;
- key panels missing or unreachable at 390×844;
- direct CelesTrak requests failing with HTTP 403;
- obsolete RainViewer tile URLs failing with HTTP 410;
- simulated aircraft automatically entering a screen presented as live.

These findings are the acceptance baseline for the product-foundation work. Current desktop and mobile screenshots are stored in `docs/screenshots/` and the corresponding flows are enforced by `e2e/atlas.spec.ts`.

## Foundation acceptance

- Demo and Live Beta are explicit, separate modes.
- Live Beta never inserts demo aircraft.
- Desktop and 390×844 have no horizontal overflow.
- Provider failure is an explicit, translated UI state.
- TypeScript, unit/API integration tests, desktop/mobile E2E, production build, and dependency audit are part of the delivery gate.
