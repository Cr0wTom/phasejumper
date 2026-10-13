# Architecture

PhaseJumper is a static web app. GitHub Pages serves the built files; everything — planning, airport lookup, calendar — runs in the browser. There is no server, database, account or telemetry, and nothing a traveler enters leaves their device.

*As built through T12. Updated with each ticket.*

## Repository

```
phasejumper/                pnpm workspace, TypeScript strict, Node 22
├─ packages/engine/         @phasejumper/engine — the planner (pure)
├─ packages/airports/       OurAirports → airports.json + lookup(iata)
├─ packages/itinerary/      booking-text parser, kept but not used by the app
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
| `router.ts` | Hash routing: `#/` (Start), `#/settings`, `#/evidence`, `#/legal` (terms and privacy), `#/trip[/<id>]` (new trip, or edit a saved one), `#/plan[/<id>]` (a plan, or the last opened), `#/today`, and share links `#p=<base64url PlanInput>`; anything else goes to `#/` |
| `routes/start/` + `exampleTrip.ts` | Start: a live phase map of a fixed example trip (PRG → SFO, planned on the device), Plan a trip, the plans saved on this device, footer, link to `#/legal` |
| `routes/settings/` | Settings: dark/light, export plans as JSON, import (`storage/importPlans.ts` checks every trip with the engine, a file with any bad trip imports nothing; `importAll.ts` rolls back partial saves), forget all trips (two-step confirmation), Feedback mailto links (`feedback.ts`) for a bug (technical report only, no trip) or a feature request, the evidence page, terms and privacy, and Copy technical report (`technicalReport.ts`) |
| `components/Markdown.tsx` | Renders bundled Markdown (evidence, terms, privacy) as React elements: headings, paragraphs, lists, bold, https links, rules; never injects HTML |
| `routes/trip/` | Trip builder, manual entry only: You, Flights, optional Return flights, Constraints. A round trip typed as one list (it ends where it started, after a gap of at least 24 h) can be moved into return flights. With a return, days at the destination come from the flights. zod schema (`schema.ts`); form → `PlanInput` (`mapPlanInput.ts`) stores outbound legs, derived `tripDays`, and `returnLegs` on the outbound input. A long enough stay also builds a second input whose home is the destination |
| `routes/plan/` | Plan screen: decision header with the progress curve, share link and Edit trip, the phase map with a now marker, and the per-day detail list (icons allowed here); opening share links. A linked round trip shows an Outbound / Return switch. Edit trip on the return half opens the outbound trip. A short stay is one plan and says that no return plan is needed |
| `routes/today/` + `today.ts` | Today: where you are and the local time, the current and next block with countdowns (recomputed every 30 s and on returning to the tab), today's ribbon |
| `components/NavBar.tsx` | Plan · Today · New trip · Settings: bottom tab bar on phones, left rail from 768 px |
| `components/AirportCombobox.tsx` | WAI-ARIA combobox over the airport list (top 12 matches shown, full list searched) |
| `components/TimeField.tsx` | Time entry: typed text parsed by `timeText.ts`, a 15-minute list on a fine pointer; phones and tablets keep the native time input |
| `airports/` | Lazy-loads `airports.json` as its own chunk; search by IATA, city, name |
| `storage/plans.ts` | IndexedDB via `idb-keyval`: `plan:<id>` → `{ id, input, result, engineVersion, createdAt }`, plus optional `returnPlanId` (outbound half) and `outboundPlanId` (return half), and the last opened plan id. Start lists plans that have no `outboundPlanId` and labels a linked outbound plan as a round trip. JSON backup (`phasejumper-plans`, version 1, inputs only) writes each half as its own entry and does not store the link, so import does not re-link the pair. Forget-all is unchanged. Plans from an older engine are rebuilt on open with a one-line notice |
| `storage/shareLink.ts` | Share links: the `PlanInput` (never the result) as base64url JSON in the URL fragment, never sent to the host; the recipient's browser regenerates the plan |
| `flags.json` | Build-time flags (§7.4). `legal.acceptanceGate` and `melatonin.optIn` are on; the others stay off as kill switches |
| `terms.ts` | `TERMS_VERSION` and localStorage `pj.terms` (`{ acceptedTermsVersion, at }`); a failed write stays in memory for the page session |
| `components/LegalGate.tsx` | First-use / terms-changed acceptance: wellness + 18+ checkboxes, links to `#/legal`, Continue; shown on the trip form and on share links until accepted |
| `routes/settings/LegalScreen.tsx` | `#/legal`: `TERMS.md` then `PRIVACY.md`, rendered with `Markdown.tsx` (`headingOffset={1}`) |
| `components/PhaseMap/` | The phase map (§4): `layout.ts` turns a plan into rows of positioned bands (pure, unit-tested); `PhaseMap.tsx` draws them as SVG with the axis toggle, popovers and keyboard navigation |
| `styles/tokens.css` | The §5 design tokens: colors for dark (default) and light, radii and type scale; Geist and Geist Mono self-hosted from `public/fonts/` |
| `theme.ts` | Dark/light, chosen in Settings; first visit follows the OS, the choice is remembered on this device (`localStorage`, optional) |
| `icons.ts` | The fixed Lucide icon mapping (§5); never used inside the phase-map grid |
| `components/UpdatePrompt.tsx` | "A new version is ready" bar; the app never reloads itself |
| `messages.ts` | Every user-facing string in the web app |

The phase map draws one row per calendar date in the grid's zone. Destination and home hour scales sit on top, both shown by default and each switchable; the grid reads in the first one switched on. A "now" marker shows the current time on today's row while the plan is underway. Every block is placed by its own UTC instant and split at midnight and at clock changes, so DST days read correctly. Inside the grid there are only bands, glyphs and text; icons live in the legend. A test-only harness (`apps/web/harness/`, built by `vite.harness.config.ts`, never shipped) renders the golden fixtures for Playwright: screenshots at 390 and 1280 px, axe, keyboard, DST and narrow-screen checks.

"Generate plan" validates the form, maps it to `PlanInput` (zones and coordinates from `airports.json`), runs `generatePlan` in the browser, saves the result to IndexedDB and opens `#/plan/<id>`. When return flights are present and the outbound decision is not a short trip, it also plans the way home (home time zone is the destination, so usual sleep times apply there) and saves that plan linked to the outbound one. If building or saving the return fails, neither plan is kept. A short stay saves only the outbound plan. Until the traveler accepts the current terms version, the legal gate stands in place of that button (and in front of opening a share link). Melatonin timing is an opt-in with a contraindication checklist; exercise is opt-in with a one-line notice. `scripts/check-terms.ts` scans the repository for third-party names and user-facing copy for banned health words (`scripts/banned-terms.ts`, allow-list `scripts/banned-terms-allow.json`). `NOTICE` lists third-party data, fonts, icons and runtime dependency licences.

## Itinerary parser (`packages/itinerary`)

The trip builder is manual entry only. Each flight is typed in by hand.

`packages/itinerary` is kept but not used by the app. `parseItinerary(text, { referenceDate, isAirport })` reads booking-confirmation text and returns `{ legs, confidence, unparsed }`. It is pure (lint-enforced, like the engine). A reference date infers a missing year, and an airport check rejects words like THE or AND. Times are kept as the booking states them; time zones always come from the airport, never from the text. 25 anonymized fixtures cover common confirmation layouts, 12 h and 24 h times, next-day arrivals and multi-leg trips.

## Installable app (PWA)

`vite-plugin-pwa` writes the manifest (standalone, starts at `#/today`, ribbon-mark icons from `public/icons/`, rendered by `scripts/render-icons.ts`) and a Workbox service worker that precaches the app shell, fonts and airport data (≤ 3 MB, enforced at build time) and caches nothing from other origins. Updates wait for the traveler to tap Reload. On iOS the app opens full screen with a translucent status bar; safe-area insets keep content clear of the notch and home indicator.

## Data flow

```
flights + sleep habits ──▶ PlanInput ──▶ generatePlan ──▶ PlanResult ──▶ calendar / today / .ics
         ▲                                                     
   airports.json (zone + coordinates per IATA code)
```

No request leaves the page.

## Build and deploy

- **CI** (`ci.yml`, every pull request): `pnpm install --frozen-lockfile`, `check:terms`, lint, typecheck, test, build; a second job runs the Playwright end-to-end tests in Chromium (`pnpm test:e2e`) and a Lighthouse accessibility check on the trip form (fails below 95).
- **Pages** (`pages.yml`, push to `main`): build → `actions/upload-pages-artifact` → `actions/deploy-pages`. Site: https://phasejumper.world/ (custom domain; built with `VITE_BASE_PATH=/`)
- The base path comes from `VITE_BASE_PATH` (default `/phasejumper/`); set it to `/` to serve from a custom domain root.
- Rollback: revert the merge commit; Pages redeploys in about a minute.
