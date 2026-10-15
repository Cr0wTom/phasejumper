/*
 * Copyright 2026 PhaseJumper contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// §2.6 day loop. Each day: build blocks (§2.5), run the feasibility pass
// (§2.7), check the day-level sanity rule, forecast (§2.8).
//
// Day d = the main sleep that contains CBTmin_d, then the waking period up to
// the next sleep. Morning blocks are placed from CBTmin_d; evening blocks from
// the next night's CBTmin and sleep start (the spec's "sleepStart_d" for that
// evening).

import { Temporal } from "temporal-polyfill";
import {
  adviceCopy,
  droppedCopy,
  explanationCopy,
  reasonCopy,
  warningCopy,
  type AdviceCode,
} from "./copy";
import {
  feasibilityPass,
  trimAcrossDays,
  type FilterResult,
  type Leg,
  type RawBlock,
  type TripContext,
} from "./filter";
import {
  exerciseBonusMinutes,
  forecastStep,
  type ForecastState,
} from "./forecast";
import {
  ARRIVAL_LOCAL,
  CAFFEINE,
  EXERCISE,
  FEASIBILITY,
  LIGHT,
  LOCAL_NIGHT,
  MARKER_MINUTES,
  MEALS,
  MELATONIN,
  OBSERVED_SLEEP,
  PREP,
  WIND_DOWN,
} from "./prc";
import {
  EngineInputError,
  MINUTES_PER_DAY,
  chooseDirection,
  clockIn,
  estimatePhase,
  formatClock,
  instantAt,
  legInstants,
  offsetMinutes,
  parseClock,
  ratesFor,
  signedMinutes,
  validatePlanInput,
  type DirectionDecision,
  type PhaseEstimate,
} from "./phase";
import {
  type Instant,
  type Interval,
  compare,
  earlier,
  later,
  length,
  minutesBetween,
  overlaps,
  plus,
  subtract,
} from "./time";
import type {
  Block,
  BlockKind,
  DayFlag,
  Decision,
  Direction,
  EngineOptions,
  EvidenceGrade,
  LatLon,
  PlanDay,
  PlanInput,
  PlanResult,
  PlanWarning,
  ReasonCode,
  SourceRef,
} from "./types";

/** Bumped whenever plan output changes (§7.4). */
export const ENGINE_VERSION = "0.9.0";

/** Guard against a non-terminating loop; weak days at half rate stay far below. */
const MAX_PLAN_DAYS = 60;

const META: Record<
  BlockKind,
  { source: SourceRef; confidence: EvidenceGrade; movable: boolean }
> = {
  SLEEP: { source: "R1", confidence: "A", movable: false },
  SLEEP_INFLIGHT: { source: "R1", confidence: "A", movable: false },
  SEEK_LIGHT: { source: "R2", confidence: "A", movable: false },
  SEEK_LIGHT_ARTIFICIAL: { source: "R2", confidence: "A", movable: false },
  LIGHT_INFLIGHT_WINDOW: { source: "R2", confidence: "C", movable: false },
  AVOID_LIGHT: { source: "R2", confidence: "A", movable: false },
  MELATONIN_WINDOW: { source: "R4", confidence: "A", movable: true },
  MELATONIN_OK: { source: "R4", confidence: "A", movable: false },
  EXERCISE_GOOD: { source: "R9", confidence: "B", movable: true },
  EXERCISE_OK: { source: "R9", confidence: "B", movable: true },
  EXERCISE_OPTIONAL_WALK: { source: "R9", confidence: "C", movable: true },
  EXERCISE_AVOID: { source: "R9", confidence: "B", movable: false },
  CAFFEINE_OK: { source: "R10", confidence: "B", movable: false },
  CAFFEINE_LATE_OK: { source: "R10", confidence: "B", movable: false },
  CAFFEINE_STOP: { source: "R11", confidence: "B", movable: false },
  NAP: { source: "R12", confidence: "B", movable: true },
  NSDR: { source: "none", confidence: "C", movable: true },
  MEAL: { source: "none", confidence: "C", movable: true },
  WIND_DOWN: { source: "none", confidence: "C", movable: true },
};

interface DayFrame {
  index: number;
  cbtMin: Instant;
  nextCbtMin: Instant;
  /** Shift from this day to the next, minutes (0 on settled/steady days). */
  shift: number;
}

interface PlanContext {
  input: PlanInput;
  opts: EngineOptions;
  phase: PhaseEstimate;
  trip: TripContext;
  /** Direction blocks are built for, when the day is shifting. */
  direction: Direction;
  shifting: boolean;
  sleepReason: (frame: DayFrame) => ReasonCode;
  /**
   * The nights take the plan's day `index` (a frame's night is its own
   * index; its next night is index + 1).
   */
  /** Bedtime for the night around `cbtMin`, moved earlier before a flight. */
  sleepStart: (cbtMin: Instant, index: number) => Instant;
  /** Wake time for the night around `cbtMin`. */
  wake: (cbtMin: Instant, index: number) => Instant;
  /** The planned night: the body's night, kept in the local night at the destination. */
  night: (cbtMin: Instant, index: number) => Interval;
  /** Arrival style "local": the night from `start` to `wake` becomes a nap. */
  arrivalNap: (start: Instant, wake: Instant) => boolean;
}

interface BuiltDay {
  frame: DayFrame;
  filtered: FilterResult;
  lightShifted: boolean;
  melatoninDropped: boolean;
}

interface DayOutcome {
  day: BuiltDay;
  weak: boolean;
  before: number;
  after: number;
  effective: number;
}

function wakeOf(cbtMin: Instant, phase: PhaseEstimate): Instant {
  return plus(cbtMin, phase.wakeAfterCbtMin);
}

function sleepStartOf(cbtMin: Instant, phase: PhaseEstimate): Instant {
  return plus(wakeOf(cbtMin, phase), -phase.sleepNeedMinutes);
}

/** The local-night window around the usual bedtime on `date` (LOCAL_NIGHT). */
function localNightOn(
  date: Temporal.PlainDate,
  bedtimeClock: number,
  tz: string,
): Interval {
  const bed = instantAt(date, bedtimeClock, tz);
  return {
    start: plus(bed, -LOCAL_NIGHT.earliestBeforeBedtimeMinutes),
    end: plus(bed, LOCAL_NIGHT.latestAfterBedtimeMinutes),
  };
}

/**
 * The first local night at the destination: the earliest date whose window,
 * with `start` moved into it, begins at least `afterPrevious` (a while after
 * the night before ends) and still leaves the minimum sleep once the
 * traveler is out of the airport (`settled`). Only `settled` may push the
 * start past the window: a late landing gives a shorter first night.
 */
function firstLocalNight(
  start: Instant,
  bedtimeClock: number,
  tz: string,
  needMinutes: number,
  settled: Instant,
  afterPrevious: Instant,
): Temporal.PlainDate {
  const date = settled.toZonedDateTimeISO(tz).toPlainDate();
  for (const d of [-1, 0, 1, 2]) {
    const on = date.add({ days: d });
    const clamped = clampInto(start, localNightOn(on, bedtimeClock, tz));
    if (compare(clamped, afterPrevious) < 0) continue;
    const left = minutesBetween(
      later(clamped, settled),
      plus(clamped, needMinutes),
    );
    if (left >= FEASIBILITY.minSleepMinutes) return on;
  }
  return date.add({ days: 2 });
}

/** The first date whose local night starts at or after `at`. */
function firstLocalNightAfter(
  at: Instant,
  bedtimeClock: number,
  tz: string,
): Temporal.PlainDate {
  const date = at.toZonedDateTimeISO(tz).toPlainDate();
  for (const d of [-1, 0, 1]) {
    const on = date.add({ days: d });
    if (compare(localNightOn(on, bedtimeClock, tz).start, at) >= 0) return on;
  }
  return date.add({ days: 2 });
}

/** `start` moved into `window` when it falls outside it. */
function clampInto(start: Instant, window: Interval): Instant {
  return compare(start, window.start) < 0
    ? window.start
    : compare(start, window.end) > 0
      ? window.end
      : start;
}

/** Where the traveler is: home, a leg's departure zone in the air, a layover, the destination. */
function zoneLocator(
  input: PlanInput,
  legs: readonly Leg[],
): (at: Instant) => string {
  return (at) => {
    let zone = input.itinerary.homeTz;
    for (const leg of legs) {
      if (compare(at, leg.start) < 0) return zone;
      if (compare(at, leg.end) < 0) return leg.depTz;
      zone = leg.arrTz;
    }
    return input.itinerary.destinationTz;
  };
}

/**
 * The IANA zone the traveler is in at an instant: home before the first
 * departure, a leg's departure zone in the air, the arrival zone on a
 * layover, the destination after the last leg. Assumes validated input.
 */
export function travelerZoneAt(input: PlanInput, atUtc: string): string {
  const legs: Leg[] = legInstants(input).map((l) => ({
    start: l.dep,
    end: l.arr,
    depTz: l.depTz,
    arrTz: l.arrTz,
  }));
  return zoneLocator(input, legs)(Temporal.Instant.from(atUtc));
}

/** Ground position; home is taken as the first departure airport. */
function latLonLocator(
  legs: readonly Leg[],
): (at: Instant) => LatLon | undefined {
  return (at) => {
    let where = legs[0]?.depLatLon;
    for (const leg of legs) {
      if (compare(at, leg.start) < 0) return where;
      if (compare(at, leg.end) < 0) return undefined;
      where = leg.arrLatLon;
    }
    return where;
  };
}

/** Legs as instants, with airport coordinates where the input has them. */
function legsWithPlaces(input: PlanInput): Leg[] {
  return legInstants(input).map((l, i) => {
    const source = input.itinerary.legs[i];
    return {
      start: l.dep,
      end: l.arr,
      depTz: l.depTz,
      arrTz: l.arrTz,
      ...(source?.departureLatLon === undefined
        ? {}
        : { depLatLon: source.departureLatLon }),
      ...(source?.arrivalLatLon === undefined
        ? {}
        : { arrLatLon: source.arrivalLatLon }),
    };
  });
}

function localInterval(start: string, end: string, tz: string): Interval {
  const at = (v: string): Instant =>
    Temporal.PlainDateTime.from(v).toZonedDateTime(tz).toInstant();
  return { start: at(start), end: at(end) };
}

/** Never earlier than MELATONIN.earliestLocalTime on the local date of `start`. */
function notBeforeEarliest(
  start: Instant,
  zoneAt: (at: Instant) => string,
): Instant {
  const zone = zoneAt(start);
  const local = start.toZonedDateTimeISO(zone);
  const earliest = parseClock(MELATONIN.earliestLocalTime) ?? 0;
  if (local.hour * 60 + local.minute < earliest) {
    return instantAt(local.toPlainDate(), earliest, zone);
  }
  return start;
}

/** Raw (unfiltered) blocks for one day, from §2.5. */
function buildRaw(
  ctx: PlanContext,
  frame: DayFrame,
  behindSchedule: boolean,
): { raw: RawBlock[]; lightShifted: boolean; melatoninDropped: boolean } {
  const { phase, input, opts, direction } = ctx;
  const t = input.traveler;
  const raw: RawBlock[] = [];
  const add = (
    kind: BlockKind,
    start: Instant,
    end: Instant,
    reasonCode: ReasonCode,
  ): void => {
    if (minutesBetween(start, end) > 0) {
      raw.push({ kind, start, end, reasonCode });
    }
  };
  const wake = ctx.wake(frame.cbtMin, frame.index);
  const nextSleep = ctx.sleepStart(frame.nextCbtMin, frame.index + 1);
  const nextWake = ctx.wake(frame.nextCbtMin, frame.index + 1);
  const at = (hours: number): Instant => plus(frame.cbtMin, hours * 60);
  const shiftingToday = ctx.shifting && frame.shift > 0;
  let lightShifted = false;
  let melatoninDropped = false;

  add(
    "SLEEP",
    ctx.sleepStart(frame.cbtMin, frame.index),
    wake,
    ctx.sleepReason(frame),
  );

  if (shiftingToday) {
    // Light (R2, R3).
    const u = phase.uncertaintyMinutes;
    if (direction === "advance") {
      const seekStart = later(at(LIGHT.seekAdvanceStartHours), wake);
      add(
        "SEEK_LIGHT",
        seekStart,
        plus(seekStart, Math.min(LIGHT.seekMinutes, LIGHT.maxBlockMinutes)),
        "SEEK_LIGHT_ADVANCE",
      );
      // Evening before the next sleep: the delay zone, widened by u past the
      // crossover, awake part only.
      const [from, to] = LIGHT.avoidWhenAdvancing;
      add(
        "AVOID_LIGHT",
        later(plus(frame.nextCbtMin, from * 60), wake),
        earlier(plus(frame.nextCbtMin, to * 60 + u), nextSleep),
        "AVOID_LIGHT_ADVANCE",
      );
    } else {
      // Late evening before the next CBTmin; slid out of sleep if needed.
      const seekEnd = plus(frame.nextCbtMin, LIGHT.seekDelayEndHours * 60);
      let seek: Interval = {
        start: plus(seekEnd, -LIGHT.seekMinutes),
        end: seekEnd,
      };
      if (overlaps(seek, { start: nextSleep, end: nextWake })) {
        seek = { start: plus(nextSleep, -LIGHT.seekMinutes), end: nextSleep };
        lightShifted = true;
      }
      add("SEEK_LIGHT", seek.start, seek.end, "SEEK_LIGHT_DELAY");
      // Morning after this sleep: the advance zone, widened by u.
      const [from, to] = LIGHT.avoidWhenDelaying;
      add(
        "AVOID_LIGHT",
        later(plus(frame.cbtMin, from * 60 - u), wake),
        earlier(plus(frame.cbtMin, to * 60), nextSleep),
        "AVOID_LIGHT_DELAY",
      );
    }

    // Melatonin (R4, R5): opted in and not contraindicated.
    // Advance: a range up to sleep, with a 30 min best time inside it.
    // Delay: the opt-in wake window only; no range.
    if (t.useMelatonin && t.melatoninContraindicated !== true) {
      if (direction === "delay") {
        if (opts.allowDelayMelatonin === true) {
          add(
            "MELATONIN_WINDOW",
            wake,
            plus(wake, MELATONIN.delayAfterWakeMinutes),
            "MELATONIN_WINDOW_DELAY",
          );
        }
      } else {
        const hours =
          t.melatoninTiming === "evening"
            ? MELATONIN.eveningBeforeSleepHours
            : MELATONIN.advanceBeforeSleepHours;
        const start = notBeforeEarliest(
          plus(nextSleep, -hours * 60),
          ctx.trip.zoneAt,
        );
        const end = plus(start, MELATONIN.windowMinutes);
        const window: Interval | undefined =
          compare(end, nextSleep) > 0 ? undefined : { start, end };
        if (window === undefined) melatoninDropped = true;
        else {
          add(
            "MELATONIN_WINDOW",
            window.start,
            window.end,
            t.melatoninTiming === "evening"
              ? "MELATONIN_WINDOW_EVENING"
              : "MELATONIN_WINDOW",
          );
        }
        const rangeStart = notBeforeEarliest(
          plus(nextSleep, -MELATONIN.rangeBeforeSleepHours * 60),
          ctx.trip.zoneAt,
        );
        if (compare(rangeStart, nextSleep) < 0) {
          const cuts: Interval[] = [
            ...ctx.trip.preDeparture,
            ...ctx.trip.postArrival,
          ];
          // The best time is cut out where it finally lands (applyCollisions),
          // so a moved best time leaves no gap in the range.
          for (const piece of subtract(
            { start: rangeStart, end: nextSleep },
            cuts,
          )) {
            if (
              minutesBetween(piece.start, piece.end) >=
              FEASIBILITY.minBlockMinutes
            ) {
              add("MELATONIN_OK", piece.start, piece.end, "MELATONIN_OK");
            }
          }
        }
      }
    }
  }

  // Exercise (R9): shifting plans only.
  if (ctx.shifting && t.exercise.enabled) {
    const bedtimeAvoid = plus(nextSleep, -EXERCISE.avoidBeforeSleepHours * 60);
    const bedtimeAvoidStart = later(bedtimeAvoid, wake);
    add(
      "EXERCISE_AVOID",
      bedtimeAvoidStart,
      nextSleep,
      "EXERCISE_AVOID_BEDTIME",
    );
    const cuts: Interval[] = [];
    if (shiftingToday) {
      const preferred = Math.round(
        t.exercise.preferredMinutes ?? EXERCISE.defaultMinutes,
      );
      const awakePart = (from: number, to: number): Interval => ({
        start: later(at(from), wake),
        end: earlier(at(to), bedtimeAvoid),
      });
      const good =
        direction === "advance"
          ? [EXERCISE.advanceAfternoonZone, EXERCISE.advanceMorningZone]
          : [EXERCISE.delayZone];
      for (const [from, to] of good) {
        const zone = awakePart(from, to);
        const end = earlier(plus(zone.start, preferred), zone.end);
        if (minutesBetween(zone.start, end) > 0) {
          add(
            "EXERCISE_GOOD",
            zone.start,
            end,
            direction === "advance"
              ? "EXERCISE_GOOD_ADVANCE"
              : "EXERCISE_GOOD_DELAY",
          );
          cuts.push({ start: zone.start, end });
          break;
        }
      }
      const opposite =
        direction === "advance"
          ? [EXERCISE.delayZone]
          : [EXERCISE.advanceMorningZone, EXERCISE.advanceAfternoonZone];
      for (const [from, to] of opposite) {
        const zone = awakePart(from, to);
        add("EXERCISE_AVOID", zone.start, zone.end, "EXERCISE_AVOID_DIRECTION");
        if (minutesBetween(zone.start, zone.end) > 0) {
          cuts.push(zone);
        }
      }
    }
    // Leftover awake time from wake to the bedtime no-exercise block,
    // minus the ideal window and any wrong-direction no-exercise window.
    for (const piece of subtract(
      { start: wake, end: bedtimeAvoidStart },
      cuts,
    )) {
      if (
        minutesBetween(piece.start, piece.end) >= FEASIBILITY.minBlockMinutes
      ) {
        add("EXERCISE_OK", piece.start, piece.end, "EXERCISE_OK");
      }
    }
  }

  // Caffeine (R10, R11).
  if (t.caffeine !== "none") {
    let stop = plus(nextSleep, -CAFFEINE.stopBeforeSleepHours[t.caffeine] * 60);
    if (shiftingToday && direction === "advance") {
      stop = earlier(stop, at(CAFFEINE.advanceStopAfterCbtMinHours));
    }
    if (compare(stop, wake) > 0) {
      add("CAFFEINE_OK", wake, stop, "CAFFEINE_OK");
      if (shiftingToday && direction === "delay" && behindSchedule) {
        const lateEnd = plus(nextSleep, -CAFFEINE.lateOkBeforeSleepHours * 60);
        if (compare(lateEnd, stop) > 0) {
          add("CAFFEINE_LATE_OK", stop, lateEnd, "CAFFEINE_LATE_OK");
          stop = lateEnd;
        }
      }
      add("CAFFEINE_STOP", stop, plus(stop, MARKER_MINUTES), "CAFFEINE_STOP");
    }
  }

  // Meals (opt-in, grade C): markers.
  if (t.mealTiming.enabled) {
    const awake = minutesBetween(wake, nextSleep);
    for (const meal of [
      plus(wake, MEALS.afterWakeHours * 60),
      plus(wake, Math.round(awake / 2)),
      plus(nextSleep, -MEALS.lastBeforeSleepHours * 60),
    ]) {
      add("MEAL", meal, plus(meal, MARKER_MINUTES), "MEAL");
    }
  }

  // Wind-down (opt-in, grade C).
  if (t.meditation.enabled) {
    const minutes = Math.round(
      t.meditation.minutes ?? WIND_DOWN.defaultMinutes,
    );
    add(
      "WIND_DOWN",
      later(plus(nextSleep, -minutes), wake),
      nextSleep,
      "WIND_DOWN",
    );
  }

  return { raw, lightShifted, melatoninDropped };
}

/**
 * Minutes between the planned night around `cbtMin` and a reported main
 * sleep that matches it (reported midpoint minus planned midpoint), capped
 * to ±OBSERVED_SLEEP.maxShiftHours; 0 when nothing matches or the
 * difference is negligible.
 */
function reportedShiftMinutes(
  planned: Interval,
  phase: PhaseEstimate,
  observed: readonly Interval[],
): number {
  const plannedMid = plus(
    planned.start,
    Math.round(phase.sleepNeedMinutes / 2),
  );
  let best: number | undefined;
  for (const sleep of observed) {
    if (length(sleep) < OBSERVED_SLEEP.minMainSleepHours * 60) continue;
    const mid = plus(sleep.start, Math.round(length(sleep) / 2));
    const delta = minutesBetween(plannedMid, mid);
    if (Math.abs(delta) > OBSERVED_SLEEP.matchWithinHours * 60) continue;
    if (best === undefined || Math.abs(delta) < Math.abs(best)) best = delta;
  }
  if (best === undefined || Math.abs(best) < OBSERVED_SLEEP.ignoreUnderMinutes)
    return 0;
  const cap = OBSERVED_SLEEP.maxShiftHours * 60;
  return Math.max(-cap, Math.min(cap, best));
}

function buildDay(
  ctx: PlanContext,
  frame: DayFrame,
  behindSchedule: boolean,
): BuiltDay {
  const { raw, lightShifted, melatoninDropped } = buildRaw(
    ctx,
    frame,
    behindSchedule,
  );
  const filtered = feasibilityPass(
    raw,
    {
      index: frame.index,
      sleepStart: ctx.sleepStart(frame.cbtMin, frame.index),
      wake: ctx.wake(frame.cbtMin, frame.index),
      nextSleepStart: ctx.sleepStart(frame.nextCbtMin, frame.index + 1),
      arrivalNap: ctx.arrivalNap(
        ctx.sleepStart(frame.cbtMin, frame.index),
        ctx.wake(frame.cbtMin, frame.index),
      ),
      arrivalLocal: ctx.input.traveler.arrivalStyle === "local",
    },
    ctx.trip,
  );
  return { frame, filtered, lightShifted, melatoninDropped };
}

/** §2.7 rule 5: a seek-light block overlapping the zone that moves the clock the right way. */
function hasLightInZone(day: BuiltDay, direction: Direction): boolean {
  const zone: Interval =
    direction === "advance"
      ? {
          start: plus(day.frame.cbtMin, LIGHT.advanceZone[0] * 60),
          end: plus(day.frame.cbtMin, LIGHT.advanceZone[1] * 60),
        }
      : {
          start: plus(day.frame.nextCbtMin, LIGHT.delayZone[0] * 60),
          end: plus(day.frame.nextCbtMin, LIGHT.delayZone[1] * 60),
        };
  return day.filtered.blocks.some(
    (b) =>
      (b.kind === "SEEK_LIGHT" || b.kind === "SEEK_LIGHT_ARTIFICIAL") &&
      overlaps(b, zone),
  );
}

function finalize(raw: RawBlock, zoneAt: (at: Instant) => string): Block {
  return {
    kind: raw.kind,
    startUtc: raw.start.toString(),
    endUtc: raw.end.toString(),
    localTz: zoneAt(raw.start),
    reasonCode: raw.reasonCode,
    reason: reasonCopy(raw.reasonCode),
    ...META[raw.kind],
  };
}

function explanation(
  decision: DirectionDecision,
  chosenDays: number,
  tripDays: number | undefined,
): string {
  if (decision.direction === "none") {
    return explanationCopy.lightTouch(decision.deltaMinutes / 60);
  }
  if (decision.direction === "short-trip") {
    return explanationCopy.shortTrip({
      tripDays: tripDays ?? 0,
      shiftDays:
        decision.shiftDirection === "advance"
          ? decision.daysAdvance
          : decision.daysDelay,
    });
  }
  const advance = decision.shiftDirection === "advance";
  return explanationCopy.shift({
    direction: decision.shiftDirection,
    shiftHours:
      (advance ? decision.advanceMinutes : decision.delayMinutes) / 60,
    days: chosenDays,
    otherShiftHours:
      (advance ? decision.delayMinutes : decision.advanceMinutes) / 60,
    otherDays: advance ? decision.daysDelay : decision.daysAdvance,
    forced: decision.forced,
  });
}

/** The engine's one public entry point. Pure and deterministic. */
export function generatePlan(
  input: PlanInput,
  opts: EngineOptions = {},
): PlanResult {
  const valid = validatePlanInput(input);
  if (!valid.ok) throw new EngineInputError(valid.issues);

  const { traveler, itinerary } = input;
  const phase = estimatePhase(traveler);
  const legs = legsWithPlaces(input);
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  if (firstLeg === undefined || lastLeg === undefined) {
    throw new EngineInputError(["itinerary.legs must not be empty"]);
  }
  const destinationTz = itinerary.destinationTz;
  const target = phase.cbtMinClock;
  const departureDate = firstLeg.start
    .toZonedDateTimeISO(itinerary.homeTz)
    .toPlainDate();

  // §2.3: delta from CBTmin on the first planned day, read in destination time.
  const choice = (from: Temporal.PlainDate) => {
    const cbtMin = instantAt(from, target, itinerary.homeTz);
    const delta = signedMinutes(clockIn(cbtMin, destinationTz) - target);
    return chooseDirection(delta, ratesFor(traveler), itinerary.tripDays, opts);
  };
  // Prep days (R5): only as many as the shift needs, up to the traveler's
  // choice, so a small shift does not start days early for nothing.
  const prepDays = (() => {
    const d = choice(departureDate.subtract({ days: traveler.preAdjustDays }));
    if (d.direction !== "advance" && d.direction !== "delay") return 0;
    const needed =
      d.direction === "advance" ? d.advanceMinutes : d.delayMinutes;
    return Math.min(
      traveler.preAdjustDays,
      Math.ceil(needed / PREP.shiftMinutesPerDay),
    );
  })();
  const firstDay = departureDate.subtract({ days: prepDays });
  const cbtMin0 = instantAt(firstDay, target, itinerary.homeTz);
  const decision = choice(firstDay);

  const constraints = input.constraints ?? {};
  const zoneAt = zoneLocator(input, legs);
  // Awake before every departure: 3 h from home or after a stay, 1 h before
  // a connection (already at the airport).
  const preDeparture: Interval[] = legs.map((l, i) => {
    const previous = legs[i - 1];
    const connecting =
      previous !== undefined &&
      minutesBetween(previous.end, l.start) <
        FEASIBILITY.connectionMaxHours * 60;
    return {
      start: plus(
        l.start,
        -(connecting
          ? FEASIBILITY.awakeBeforeConnectionMinutes
          : FEASIBILITY.awakeBeforeDepartureHours * 60),
      ),
      end: l.start,
    };
  });
  const postArrival: Interval[] = legs.map((l) => ({
    start: l.end,
    end: plus(l.end, FEASIBILITY.awakeAfterArrivalMinutes),
  }));
  const trip: TripContext = {
    legs,
    preDeparture,
    postArrival,
    mustBeAwake: (constraints.mustBeAwake ?? []).map((e) =>
      localInterval(e.start, e.end, e.tz),
    ),
    noWorkout: (constraints.noWorkoutWindows ?? []).map((e) =>
      localInterval(e.start, e.end, e.tz),
    ),
    exerciseEnabled: traveler.exercise.enabled,
    meditationEnabled: traveler.meditation.enabled,
    zoneAt,
    latLonAt: latLonLocator(legs),
  };
  const shifting =
    decision.direction === "advance" || decision.direction === "delay";
  const observed: Interval[] = (input.observedSleep ?? []).map((r) => ({
    start: Temporal.Instant.from(r.start),
    end: Temporal.Instant.from(r.end),
  }));
  // Arrival style "local" (practical, opt-in): only for plans that shift.
  const finalLanding = legs[legs.length - 1]?.end;
  const outOfAirport =
    traveler.arrivalStyle === "local" && shifting && finalLanding !== undefined
      ? plus(finalLanding, FEASIBILITY.awakeAfterArrivalMinutes)
      : undefined;
  // The planned night: the body's night, but at the destination kept in the
  // local night around the usual bedtime (LOCAL_NIGHT). Light still follows
  // the body clock; that is what moves it.
  const bedtimeClock = parseClock(traveler.habitualBedtime) ?? 0;
  // The first night at the destination takes the nearest local night; each
  // later day of the plan takes the next one, so two days never share one.
  let anchor: { index: number; date: Temporal.PlainDate } | undefined;
  const settled = plus(lastLeg.end, FEASIBILITY.awakeAfterArrivalMinutes);
  // Each day's planned night, so the first one at the destination can start
  // a while after the night before (often the one on the plane) ends.
  const planned = new Map<number, Interval>();
  const night = (cbtMin: Instant, index: number): Interval => {
    const start = sleepStartOf(cbtMin, phase);
    const body = { start, end: wakeOf(cbtMin, phase) };
    if (!shifting || compare(start, lastLeg.end) < 0) {
      planned.set(index, body);
      return body;
    }
    if (anchor === undefined || index < anchor.index) {
      anchor = {
        index,
        // Arrival style "local": the first night is the arrival evening's,
        // once there has been time to get out of the airport and settle.
        date:
          outOfAirport === undefined
            ? firstLocalNight(
                start,
                bedtimeClock,
                destinationTz,
                phase.sleepNeedMinutes,
                settled,
                plus(
                  planned.get(index - 1)?.end ?? lastLeg.end,
                  ARRIVAL_LOCAL.minAwakeBeforeBedHours * 60,
                ),
              )
            : firstLocalNightAfter(
                plus(outOfAirport, ARRIVAL_LOCAL.minAwakeBeforeBedHours * 60),
                bedtimeClock,
                destinationTz,
              ),
      };
    }
    const date = anchor.date.add({ days: index - anchor.index });
    const window = localNightOn(date, bedtimeClock, destinationTz);
    // Arrival style "local" starts that first night at the window's start.
    const local =
      outOfAirport !== undefined && index === anchor.index
        ? window.start
        : clampInto(start, window);
    // A night never starts before landing plus the time to get out of the
    // airport; a late first night keeps its wake time and is shorter.
    const result = {
      start: later(local, settled),
      end: plus(local, phase.sleepNeedMinutes),
    };
    planned.set(index, result);
    return result;
  };
  const direction = decision.shiftDirection;
  const ctx: PlanContext = {
    input,
    opts,
    phase,
    trip,
    direction,
    shifting,
    sleepReason:
      decision.direction === "none"
        ? () => "SLEEP_LOCAL_TIME"
        : decision.direction === "short-trip"
          ? () => "SLEEP_HOME_TIME"
          : (f) => (f.shift > 0 ? "SLEEP_SHIFTING" : "SLEEP_SETTLED"),
    night,
    wake: (cbtMin, index) => night(cbtMin, index).end,
    sleepStart: (cbtMin, index) => {
      const { start, end: wake } = night(cbtMin, index);
      // A departure buffer that begins after bedtime cuts the end of this
      // night; recover up to an hour of it by going to bed earlier.
      const cut = preDeparture.find(
        (p) => compare(p.start, start) > 0 && compare(p.start, wake) < 0,
      );
      if (cut === undefined) return start;
      const lost = minutesBetween(cut.start, wake);
      return plus(start, -Math.min(FEASIBILITY.earlierBedtimeMaxMinutes, lost));
    },
    // A daytime sleep on the ground after the final landing becomes a nap,
    // whichever arrival style: the night comes in the local night.
    arrivalNap: (start, wake) => {
      if (!shifting) return false;
      if (compare(wake, settled) <= 0) return false;
      if (minutesBetween(settled, start) > 12 * 60) return false;
      const ground = { start: later(start, settled), end: wake };
      if (length(ground) < 15) return false;
      const middle = plus(ground.start, Math.round(length(ground) / 2));
      const hour = middle.toZonedDateTimeISO(destinationTz).hour;
      return (
        hour >= ARRIVAL_LOCAL.daytimeFromHour &&
        hour < ARRIVAL_LOCAL.daytimeToHour
      );
    },
  };

  const steady = (cbtMin: Instant, index: number): DayFrame => ({
    index,
    cbtMin,
    nextCbtMin: plus(cbtMin, MINUTES_PER_DAY),
    shift: 0,
  });
  const misalignment = (cbtMin: Instant): number =>
    Math.abs(signedMinutes(clockIn(cbtMin, destinationTz) - target)) / 60;

  const outcomes: DayOutcome[] = [];
  if (decision.direction === "none") {
    // One day: the first night on destination time after the final arrival.
    // The body is still |delta| off; the plan does not model it.
    const arrival = lastLeg.end.toZonedDateTimeISO(destinationTz);
    let cbtMin = instantAt(arrival.toPlainDate(), target, destinationTz);
    if (compare(cbtMin, lastLeg.end) < 0) {
      cbtMin = instantAt(
        arrival.toPlainDate().add({ days: 1 }),
        target,
        destinationTz,
      );
    }
    const body = Math.abs(decision.deltaMinutes) / 60;
    outcomes.push({
      day: buildDay(ctx, steady(cbtMin, 0), false),
      weak: false,
      before: body,
      after: body,
      effective: 0,
    });
  } else if (decision.direction === "short-trip") {
    const home = instantAt(departureDate, target, itinerary.homeTz);
    for (let i = 0; i <= (itinerary.tripDays ?? 0); i += 1) {
      const cbtMin = plus(home, i * MINUTES_PER_DAY);
      outcomes.push({
        day: buildDay(ctx, steady(cbtMin, i), false),
        weak: false,
        before: misalignment(cbtMin),
        after: misalignment(cbtMin),
        effective: 0,
      });
    }
  } else {
    const rate = decision.rateMinutes[direction];
    const sign = direction === "advance" ? -1 : 1;
    const initial =
      direction === "advance" ? decision.advanceMinutes : decision.delayMinutes;
    let remaining = initial;
    let cbtMin = cbtMin0;
    let behindSchedule = false;
    let forecast: ForecastState = { cbtMin: cbtMin0, remaining: initial };
    let followsReport = false;
    for (let index = 0; ; index += 1) {
      if (index >= MAX_PLAN_DAYS) {
        throw new Error(
          `engine invariant: plan did not converge within ${MAX_PLAN_DAYS} days`,
        );
      }
      // Before the flight, 1 h a day (R5).
      const dayRate =
        index < prepDays ? Math.min(rate, PREP.shiftMinutesPerDay) : rate;
      const planned = Math.min(dayRate, remaining);
      const frameFor = (shift: number): DayFrame => {
        const next = plus(cbtMin, MINUTES_PER_DAY + sign * shift);
        // A report counts as progress at most up to the target, never past
        // it (the plan cannot shift back the other way).
        // A report of this frame's night (the one that starts the day)
        // re-anchors the body clock from there: the night itself stays as
        // planned, the evening and the nights after it follow the report.
        // The plan's last day (no shift) has nothing left to re-plan.
        const reported =
          shift === 0
            ? 0
            : reportedShiftMinutes(night(cbtMin, index), phase, observed);
        const progress = Math.min(
          sign * reported,
          Math.max(0, remaining - shift),
        );
        const delta = sign * reported > 0 ? sign * progress : reported;
        return { index, cbtMin, nextCbtMin: plus(next, delta), shift };
      };
      let day = buildDay(ctx, frameFor(planned), behindSchedule);
      let weak = false;
      if (planned > 0 && !hasLightInZone(day, direction)) {
        // §2.7 rule 5: half rate today; the plan gets longer accordingly.
        weak = true;
        day = buildDay(
          ctx,
          frameFor(Math.min(Math.round(dayRate / 2), remaining)),
          behindSchedule,
        );
      }
      if (followsReport) day.filtered.warnings.push("PLAN_ADJUSTED_TO_SLEEP");
      const step = forecastStep(forecast, {
        shift: day.frame.shift,
        bonus:
          day.frame.shift > 0
            ? exerciseBonusMinutes(
                day.filtered.blocks,
                day.frame.cbtMin,
                direction,
              )
            : 0,
        rate: dayRate,
        sign,
        destinationTz,
      });
      outcomes.push({
        day,
        weak,
        before: misalignment(forecast.cbtMin),
        after: misalignment(step.next.cbtMin),
        effective: step.effectiveMinutes / 60,
      });
      forecast = step.next;
      if (planned === 0) break;
      // A DST change at the destination moves the target in UTC.
      const offsetChange =
        offsetMinutes(day.frame.nextCbtMin, destinationTz) -
        offsetMinutes(cbtMin, destinationTz);
      remaining = Math.max(
        0,
        remaining - day.frame.shift - sign * offsetChange,
      );
      // How far a report moved the next night from the plan.
      const delta = minutesBetween(
        plus(cbtMin, MINUTES_PER_DAY + sign * day.frame.shift),
        day.frame.nextCbtMin,
      );
      followsReport = delta !== 0;
      if (followsReport) {
        remaining = Math.max(0, remaining - sign * delta);
        // A report is a measurement: the forecast restarts from it.
        forecast = { cbtMin: day.frame.nextCbtMin, remaining };
      }
      cbtMin = day.frame.nextCbtMin;
      behindSchedule = behindSchedule || weak;
    }
  }

  // Assemble.
  trimAcrossDays(outcomes.map((o) => o.day.filtered));
  const warnings: PlanWarning[] = [];
  const warn = (code: PlanWarning["code"], dayIndex?: number): void => {
    warnings.push({
      code,
      message: warningCopy(code),
      ...(dayIndex === undefined ? {} : { dayIndex }),
    });
  };
  if (phase.uncertain) warn("PHASE_ESTIMATE_UNCERTAIN");
  if (outcomes.some((o) => o.day.lightShifted)) warn("LIGHT_BLOCK_SHIFTED");
  if (outcomes.some((o) => o.day.filtered.daylightUnknown)) {
    warn("DAYLIGHT_UNKNOWN");
  }

  const dropped: PlanResult["droppedBlocks"] = [];
  const staticAdvice: PlanResult["staticAdvice"] = [];
  const days: PlanDay[] = outcomes.map(
    ({ day, weak, before, after, effective }) => {
      const index = day.frame.index;
      for (const code of day.filtered.warnings) warn(code, index);
      if (weak) warn("WEAK_DAY", index);
      if (day.melatoninDropped) {
        dropped.push({
          dayIndex: index,
          kind: "MELATONIN_WINDOW",
          reason: droppedCopy("MELATONIN_NO_WINDOW"),
        });
      }
      for (const d of day.filtered.dropped) {
        dropped.push({
          dayIndex: index,
          kind: d.kind,
          reason: droppedCopy(d.code),
        });
      }
      for (const code of new Set<AdviceCode>(day.filtered.advice)) {
        staticAdvice.push({
          dayIndex: index,
          text: adviceCopy(code),
          source: "none",
        });
      }
      const flags = [...new Set<DayFlag>(day.filtered.flags)];
      if (weak) flags.push("WEAK_DAY");
      const wake = night(day.frame.cbtMin, day.frame.index).end;
      return {
        date: wake.toZonedDateTimeISO(destinationTz).toPlainDate().toString(),
        localTzAtWake: zoneAt(wake),
        cbtMinUtc: day.frame.cbtMin.toString(),
        blocks: day.filtered.blocks.map((b) => finalize(b, zoneAt)),
        misalignmentBefore: before,
        misalignmentAfter: after,
        effectiveShiftHours: effective,
        flags,
      };
    },
  );

  // Days of the plan actually chosen: shift days, the days kept on home
  // time, or none.
  const chosenDays = shifting
    ? days.length - 1
    : decision.direction === "short-trip"
      ? (itinerary.tripDays ?? 0)
      : 0;
  const result: Decision = {
    direction: decision.direction,
    deltaHours: decision.deltaMinutes / 60,
    daysAdvance: decision.daysAdvance,
    daysDelay: decision.daysDelay,
    chosenDays,
    targetCbtMinLocal: formatClock(target),
    explanation: explanation(decision, chosenDays, itinerary.tripDays),
  };
  return {
    decision: result,
    days,
    staticAdvice,
    warnings,
    droppedBlocks: dropped,
    engineVersion: ENGINE_VERSION,
  };
}
