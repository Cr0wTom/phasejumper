# Architecture

PhaseJumper is a static web app. GitHub Pages serves the built files; everything — planning, airport lookup, calendar — runs in the browser. There is no server, database, account or telemetry, and nothing a traveler enters leaves their device.

*As built through T05. Updated with each ticket.*

## Repository

```
phasejumper/                pnpm workspace, TypeScript strict, Node 22
├─ packages/engine/         @phasejumper/engine — the planner (pure)
├─ packages/airports/       OurAirports → airports.json + lookup(iata)
├─ packages/itinerary/      itinerary-text parser (placeholder until T07)
├─ packages/ical/           plan → .ics (placeholder until T10)
├─ apps/web/                Vite 6 + React 19 + Tailwind v4 + vite-plugin-pwa (placeholder page)
├─ docs/                    this documentation (CC BY 4.0)
└─ .github/workflows/       ci.yml (pull requests), pages.yml (deploy on push to main)
```

## Engine (`packages/engine/src`)

| Module | Role |
|---|---|
| `types.ts` | Public data contract: `PlanInput`, `PlanResult`, blocks, warnings |
| `prc.ts` | Every model constant, with sources (documented in [ENGINE.md](ENGINE.md)) |
| `phase.ts` | Phase estimate, required shift, direction choice, input validation |
| `schedule.ts` | `generatePlan`: the day loop, weak-day handling, assembly |
| `filter.ts` | Feasibility pass: flights, must-be-awake, daylight, collisions |
| `forecast.ts` | Expected shift and misalignment per day |
| `copy.ts` | Every user-facing string the engine emits |
| `time.ts` | Instant and interval helpers |

Runtime dependencies: `temporal-polyfill` (time) and `suncalc` (daylight). Lint forbids I/O, network, `Date.now()` and randomness in this package.

Testing: unit tests, fast-check property tests over 500 random trips, and eight golden fixture plans (snapshot files, see [CONTRIBUTING](CONTRIBUTING.md)).

## Airports (`packages/airports`)

`build.ts` downloads the OurAirports CSV pinned to a commit with a recorded SHA-256 (60 s timeout, no retries), keeps airports with scheduled service and an IATA code, resolves each IANA zone from coordinates with `@photostructure/tz-lookup`, and writes `src/airports.json` (≈ 4,100 airports, ≈ 200 KB gzipped). It is run by hand; the generated file is committed so builds need no network. `lookup(iata)` returns `{ iata, icao, name, city, country, lat, lon, tz }`.

## Data flow

```
flights + sleep habits ──▶ PlanInput ──▶ generatePlan ──▶ PlanResult ──▶ calendar / today / .ics
         ▲                                                     
   airports.json (zone + coordinates per IATA code)
```

No request leaves the page.

## Build and deploy

- **CI** (`ci.yml`, every pull request): `pnpm install --frozen-lockfile`, lint, typecheck, test, build.
- **Pages** (`pages.yml`, push to `main`): build → `actions/upload-pages-artifact` → `actions/deploy-pages`. Site: https://cr0wtom.github.io/phasejumper/
- The base path comes from `VITE_BASE_PATH` (default `/phasejumper/`); set it to `/` to serve from a custom domain root.
- Rollback: revert the merge commit; Pages redeploys in about a minute.
