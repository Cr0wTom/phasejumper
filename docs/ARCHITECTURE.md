# Architecture

PhaseJumper is a static web app. GitHub Pages serves the built files; everything — planning, airport lookup, calendar — runs in the browser. There is no server, database, account or telemetry, and nothing a traveler enters leaves their device.

*As built through T08 and the native date and time pickers. Updated with each ticket.*

## Repository

```
phasejumper/                pnpm workspace, TypeScript strict, Node 22
├─ packages/engine/         @phasejumper/engine — the planner (pure)
├─ packages/airports/       OurAirports → airports.json + lookup(iata)
├─ packages/itinerary/      pasted booking text → flight legs (pure)
├─ packages/ical/           plan → .ics (placeholder until T10)
├─ apps/web/                Vite 6 + React 19 + Tailwind v4 + vite-plugin-pwa: trip builder, plan placeholder
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

## Web app (`apps/web/src`)

| Path | Role |
|---|---|
| `router.ts` | Hash routing: `#/trip`, `#/plan/<id>`; anything else goes to `#/trip` |
| `routes/trip/` | Trip builder: You, Flights, Constraints; zod schema (`schema.ts`), form → `PlanInput` (`mapPlanInput.ts`) |
| `routes/plan/` | Placeholder showing the saved plan's explanation (full view: T09) |
| `components/AirportCombobox.tsx` | WAI-ARIA combobox over the airport list (top 12 matches shown, full list searched) |
| `airports/` | Lazy-loads `airports.json` as its own chunk; search by IATA, city, name |
| `storage/plans.ts` | IndexedDB via `idb-keyval`: `plan:<id>` → `{ id, input, result, engineVersion, createdAt }` |
| `flags.json` | Build-time flags (§7.4) plus `legal.acceptanceGate` and `melatonin.optIn`, all off |
| `components/PhaseMap/` | The phase map (§4): `layout.ts` turns a plan into rows of positioned bands (pure, unit-tested); `PhaseMap.tsx` draws them as SVG with the axis toggle, popovers and keyboard navigation |
| `messages.ts` | Every user-facing string in the web app |

The phase map draws one row per calendar date in the grid's zone. Destination and home hour scales sit on top, both shown by default and each switchable; the grid reads in the first one switched on. A "now" marker shows the current time on today's row while the plan is underway. Every block is placed by its own UTC instant and split at midnight and at clock changes, so DST days read correctly. Inside the grid there are only bands, glyphs and text; icons live in the legend. A test-only harness (`apps/web/harness/`, built by `vite.harness.config.ts`, never shipped) renders the golden fixtures for Playwright: screenshots at 390 and 1280 px, axe, keyboard, DST and narrow-screen checks.

"Generate plan" validates the form, maps it to `PlanInput` (zones and coordinates from `airports.json`), runs `generatePlan` in the browser, saves the result to IndexedDB and opens `#/plan/<id>`. The melatonin toggle and the legal gate stay hidden until T12 turns their flags on.

## Itinerary parser (`packages/itinerary`)

`parseItinerary(text, { referenceDate, isAirport })` reads pasted booking-confirmation text and returns `{ legs, confidence, unparsed }`. It is pure (lint-enforced, like the engine): the app passes today's date (to infer a missing year) and an airport check (to reject words like THE or AND). Times are kept as the booking states them; time zones always come from the airport, never from the text. 25 anonymized fixtures cover common confirmation layouts, 12 h and 24 h times, next-day arrivals and multi-leg trips.

In the trip builder, "Read flights" replaces the flight legs with what was found and marks each filled field to check; lines that looked like flight data but couldn't be read are listed under the box. The pasted text is cleared at once and never stored.

## Data flow

```
flights + sleep habits ──▶ PlanInput ──▶ generatePlan ──▶ PlanResult ──▶ calendar / today / .ics
         ▲                                                     
   airports.json (zone + coordinates per IATA code)
```

No request leaves the page.

## Build and deploy

- **CI** (`ci.yml`, every pull request): `pnpm install --frozen-lockfile`, lint, typecheck, test, build; a second job runs the Playwright end-to-end tests in Chromium (`pnpm test:e2e`).
- **Pages** (`pages.yml`, push to `main`): build → `actions/upload-pages-artifact` → `actions/deploy-pages`. Site: https://cr0wtom.github.io/phasejumper/
- The base path comes from `VITE_BASE_PATH` (default `/phasejumper/`); set it to `/` to serve from a custom domain root.
- Rollback: revert the merge commit; Pages redeploys in about a minute.
