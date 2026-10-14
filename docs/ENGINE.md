# Engine

`@phasejumper/engine` turns a trip and a traveler's sleep habits into a day-by-day plan. It is a pure function: plain data in, plain data out, no I/O, no wall clock (the current time is passed in as `PlanInput.now`), and the same input always gives the same plan.

## Contract

```ts
generatePlan(input: PlanInput, opts?: EngineOptions): PlanResult
```

Types live in [`packages/engine/src/types.ts`](../packages/engine/src/types.ts). Invalid input throws `EngineInputError` listing every problem; `validatePlanInput` returns the same check as a typed result. `engineVersion` changes whenever plan output changes, and saved plans regenerate when it does.

All time math is done on UTC instants (Temporal) in whole minutes; wall-clock time appears only at the edges.

## How a plan is built

1. **Phase estimate.** The body-clock marker is the core body temperature minimum (CBTmin), estimated as habitual wake − 2.5 h plus a chronotype offset. If that disagrees with the sleep-midpoint estimate by more than 1.5 h, the midpoint estimate is used and the plan warns.
2. **Required shift.** CBTmin on the first planned day is read in destination wall time and compared with the target (the same clock time at the destination). Under 2 h there is no shifting plan.
3. **Direction.** Days to advance and days to delay are both computed; the one with fewer days wins, a tie goes to advancing. For large eastward trips this can mean delaying the long way round. Trips of at most `max(2, days needed)` days stay on home time (short-trip).
4. **Day loop.** A day is the main sleep that contains that day's CBTmin plus the waking period after it. Morning blocks are placed from today's CBTmin, evening blocks from tomorrow's. Each day moves CBTmin by `min(rate, remaining)`; a clock change at the destination is absorbed into the remaining shift. Pre-adjust days are simply the first days of the loop.
5. **Feasibility pass**, in order: flights (in-flight sleep and light, flight-day walk, arrival-day rest), must-be-awake events (clipped sleep, short-sleep nap, melatonin moves, no-workout windows), daylight (seek-light in darkness becomes bright indoor light; avoid-light in darkness is dropped with a note), then collisions by priority. A day left without a seek-light block at the right time is a *weak day*: it shifts at half rate and the plan grows.
6. **Forecast.** Each day reports the expected shift (halved on weak days, plus a small exercise bonus that never moves the plan itself) and the misalignment before and after.

## Model constants

Every number the model uses, as defined in [`packages/engine/src/prc.ts`](../packages/engine/src/prc.ts). Zone values are hours relative to CBTmin (0 = CBTmin). A test parses this table and fails if it drifts from the code.

| Constant | Value | Meaning | Source |
|---|---|---|---|
| `PHASE.dlmoBeforeBedtimeHours` | 2 h | Dim-light melatonin onset ≈ habitual bedtime minus this | R1 |
| `PHASE.cbtMinBeforeWakeHours` | 2.5 h | CBTmin ≈ habitual wake minus this | R1 |
| `PHASE.chronotypeOffsetHours.morning` | −0.75 h | Added to CBTmin for a morning chronotype | R1 |
| `PHASE.chronotypeOffsetHours.intermediate` | 0 h | Added to CBTmin for an intermediate chronotype | R1 |
| `PHASE.chronotypeOffsetHours.evening` | 0.75 h | Added to CBTmin for an evening chronotype | R1 |
| `PHASE.midpointToCbtMinHours` | 1.5 h | Sleep-midpoint estimate: CBTmin ≈ midpoint plus this | R1 |
| `PHASE.midpointToleranceHours` | 1.5 h | Larger disagreement → use the midpoint estimate, warn | R1 |
| `PHASE.uncertaintyHours` | 1 h | Phase uncertainty; widens avoid-light edges | R1 |
| `PHASE.uncertaintyHoursWhenUnsure` | 1.5 h | Same, when the estimate is uncertain | R1 |
| `PHASE.defaultSleepNeedHours` | 8 h | Sleep window length when not given | R12 |
| `LIGHT_TOUCH_THRESHOLD_HOURS` | 2 h | Below this time difference: no shifting plan | R1 |
| `SHORT_TRIP_MIN_DAYS` | 2 days | Trips this short are always short-trip | R1 |
| `RATES.advance.withoutMelatonin` | 1 h/day | Advance rate per day | R1, R5 |
| `RATES.advance.withMelatonin` | 1.5 h/day | Advance rate per day with melatonin timing | R1, R5 |
| `RATES.delay.withoutMelatonin` | 2 h/day | Delay rate per day | R1 |
| `RATES.delay.withMelatonin` | 2 h/day | Delay rate per day with melatonin timing | R1 |
| `LIGHT.advanceZone` | [0, 6] h | Light here moves the clock earlier (relative to CBTmin) | R2, R3 |
| `LIGHT.advancePeak` | [1, 4] h | Strongest advance | R2 |
| `LIGHT.delayZone` | [−6, 0] h | Light here moves the clock later | R2, R3 |
| `LIGHT.delayPeak` | [−4, −1] h | Strongest delay | R2 |
| `LIGHT.deadZone` | [8, 14] h | Small effect either way | R2 |
| `LIGHT.seekMinutes` | 60 min | Seek-light block length | R3 |
| `LIGHT.maxBlockMinutes` | 90 min | Longest light block | R3 |
| `LIGHT.seekAdvanceStartHours` | 1 h | Advancing: seek light from max(CBTmin + this, wake) | R2 |
| `LIGHT.seekDelayEndHours` | −1 h | Delaying: seek light ending at CBTmin + this | R2 |
| `LIGHT.avoidWhenAdvancing` | [−6, 0] h | Advancing: avoid light here | R2 |
| `LIGHT.avoidWhenDelaying` | [0, 6] h | Delaying: avoid light here | R2 |
| `MELATONIN.advanceBeforeSleepHours` | 5.5 h | Advancing: window starts this long before sleep | R4, R5 |
| `MELATONIN.windowMinutes` | 30 min | Window length; timing only, never an amount | R4 |
| `MELATONIN.earliestLocalTime` | 13:00 | Never earlier than this local time | R4 |
| `MELATONIN.delayAfterWakeMinutes` | 30 min | Delaying (opt-in): window right after wake | R4 |
| `EXERCISE.advanceMorningZone` | [2, 3] h | Morning advance zone (our translation of R9 clock times) | R9 |
| `EXERCISE.advanceAfternoonZone` | [8.5, 11.5] h | Afternoon advance zone (preferred) | R9 |
| `EXERCISE.delayZone` | [14.5, 17.5] h | Evening delay zone | R9 |
| `EXERCISE.defaultMinutes` | 60 min | Exercise window length when not given | R9 |
| `EXERCISE.avoidBeforeSleepHours` | 3 h | No exercise this close to sleep | R9 |
| `EXERCISE.bonusShiftHours` | 0.3 h | Forecast-only bonus when exercise lands in its zone | R9 |
| `CAFFEINE.stopBeforeSleepHours.normal` | 8 h | Last caffeine this long before sleep | R11 |
| `CAFFEINE.stopBeforeSleepHours.heavy` | 9 h | Same, heavy caffeine users | R11 |
| `CAFFEINE.advanceStopAfterCbtMinHours` | 8 h | Advancing: also stop by CBTmin + this | R10 |
| `CAFFEINE.lateOkBeforeSleepHours` | 6 h | Delaying behind schedule: late caffeine until sleep minus this | R10 |
| `NAP.minutes` | 20 min | Nap length | R12 |
| `NAP.minutesAfterShortSleep` | 90 min | Nap length after under 4 h of sleep | R12 |
| `NAP.shortSleepHours` | 4 h | "Short sleep" for nap length | R12 |
| `NAP.endBeforeSleepHours` | 8 h | A ground nap ends at least this long before sleep | R12 |
| `MEALS.afterWakeHours` | 1 h | First meal marker after wake | — |
| `MEALS.lastBeforeSleepHours` | 3 h | Last meal marker before sleep | — |
| `WIND_DOWN.defaultMinutes` | 15 min | Wind-down length when not given | — |
| `WIND_DOWN.nsdrMinutes` | 20 min | Rest block length on arrival days | — |
| `WIND_DOWN.nsdrAfterFlightHours` | 8 h | Rest block only after a flight longer than this | — |
| `WIND_DOWN.nsdrWindow.from` | 14:00 | Rest block not before this local time | — |
| `WIND_DOWN.nsdrWindow.to` | 18:00 | Rest block ends by this local time | — |
| `WIND_DOWN.nsdrWindow.afterArrivalMinutes` | 60 min | Rest block not before arrival plus this | — |
| `FEASIBILITY.inflightSleepHours` | 4 h | This much sleep in the air → in-flight sleep | R1 |
| `FEASIBILITY.shortSleepHours` | 5 h | Less sleep than this → short-sleep day with a nap | R12 |
| `FEASIBILITY.minBlockMinutes` | 15 min | Trimmed blocks shorter than this are dropped | — |
| `FEASIBILITY.walkMinutes` | 30 min | Optional walk at the arrival airport | — |
| `FEASIBILITY.walkBeforeSleepHours` | 3 h | Walk only if it ends this long before sleep | R9 |
| `FEASIBILITY.awakeBeforeDepartureHours` | 3 h | Awake this long before every departure (getting to the airport); sleep ends here | — |
| `FEASIBILITY.earlierBedtimeMaxMinutes` | 60 min | When that cuts a night, bedtime moves at most this much earlier; the rest is a nap | R1, R12 |
| `FEASIBILITY.awakeAfterArrivalMinutes` | 60 min | Awake after every landing (leaving the plane, getting to a bed); no ground sleep or nap here | — |
| `FEASIBILITY.minSleepMinutes` | 120 min | A ground sleep cut shorter than this is not shown; the short-sleep nap covers it | R12 |
| `DAYLIGHT.sunUpAltitudeDegrees` | −0.35° | Sun below this apparent altitude counts as dark | — |
| `DAYLIGHT.sampleMinutes` | 5 min | Daylight is checked at this interval | — |
| `MARKER_MINUTES` | 5 min | Length of point events (caffeine stop, meals) | — |

## Sources

- **R1** Eastman CI, Burgess HJ. How to travel the world without jet lag. *Sleep Med Clin.* 2009;4(2):241–255. [PMC2829880](https://pmc.ncbi.nlm.nih.gov/articles/PMC2829880/)
- **R2** Khalsa SBS, Jewett ME, Cajochen C, Czeisler CA. A phase response curve to single bright light pulses in human subjects. *J Physiol.* 2003;549(Pt 3):945–952.
- **R3** St Hilaire MA, Gooley JJ, Khalsa SBS, Kronauer RE, Czeisler CA, Lockley SW. Human phase response curve to a 1 h pulse of bright white light. *J Physiol.* 2012;590(13):3035–3045.
- **R4** Burgess HJ, Revell VL, Eastman CI. A three pulse phase response curve to three milligrams of melatonin in humans. *J Physiol.* 2008;586(2):639–647; and Burgess HJ, Revell VL, Molina TA, Eastman CI. *J Clin Endocrinol Metab.* 2010;95(7):3325–3331.
- **R5** Eastman CI, Gazda CJ, Burgess HJ, Crowley SJ, Fogg LF. Advancing circadian rhythms before eastward flight: a strategy to prevent or reduce jet lag. *Sleep.* 2005;28(1):33–44. [PMC1262683](https://pmc.ncbi.nlm.nih.gov/articles/PMC1262683/)
- **R9** Youngstedt SD, Elliott JA, Kripke DF. Human circadian phase–response curves for exercise. *J Physiol.* 2019;597(8):2253–2268. [PMC6462487](https://pmc.ncbi.nlm.nih.gov/articles/PMC6462487/) — the mapping from the paper's clock times to CBTmin-relative zones is our own (assumes CBTmin ≈ 04:30).
- **R10** Burke TM, Markwald RR, McHill AW, et al. Effects of caffeine on the human circadian clock in vivo and in vitro. *Sci Transl Med.* 2015;7(305):305ra146.
- **R11** Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. *J Clin Sleep Med.* 2013;9(11):1195–1200.
- **R12** Borbély AA, Daan S, Wirz-Justice A, Deboer T. The two-process model of sleep regulation: a reappraisal. *J Sleep Res.* 2016;25(2):131–143.

Planned for a later simulation engine, not used today: **R7** Jewett, Forger, Kronauer 1999 (limit-cycle pacemaker model) and **R8** Serkh, Forger 2014 (optimal light schedules).

Volume and page numbers for R2–R4 and R10–R12 should be checked against PubMed before they are shown in the app.

## Prior art

Per-day travel schedules built from these findings are long-standing public work. Eastman and Burgess published complete day-by-day light, melatonin and sleep schedules for trips in 2009 (R1). The University of Michigan's *Entrain* app generated personalized light schedules on a phone from a mathematical model of the clock (Serkh and Forger, 2014). *Jet Lag Rooster* was a free web app producing per-day plans from 2013. PhaseJumper implements the published science independently, with citations in the code.

## Golden fixtures

Eight reference trips in [`packages/engine/test/fixtures/`](../packages/engine/test/fixtures/) pin the engine's output (spec §9.3). Each `.input.json` is written by hand; each `.expected.json` is generated by `vitest -u` and never edited. See [CONTRIBUTING](CONTRIBUTING.md) for when regenerating is allowed.
