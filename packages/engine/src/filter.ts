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

// §2.7 feasibility pass for one day. Each rule may only shorten, move, split
// or drop blocks (plus the naps, walk and NSDR the spec ties to those rules);
// it never adds shift. Rules run in the spec's order: flights, must-be-awake,
// daylight, collisions. The day-level WEAK_DAY check lives in schedule.ts
// because it changes the day loop.

import { getPosition } from "suncalc";
import { Temporal } from "temporal-polyfill";
import type { AdviceCode, DropCode } from "./copy";
import { DAYLIGHT, FEASIBILITY, NAP, WIND_DOWN } from "./prc";
import { instantAt } from "./phase";
import {
  compare,
  contains,
  intersection,
  later,
  length,
  longest,
  minutesBetween,
  overlapMinutes,
  overlaps,
  plus,
  subtract,
  type Instant,
  type Interval,
} from "./time";
import type {
  BlockKind,
  DayFlag,
  LatLon,
  ReasonCode,
  WarningCode,
} from "./types";

export interface RawBlock extends Interval {
  kind: BlockKind;
  reasonCode: ReasonCode;
}

export interface Leg extends Interval {
  depTz: string;
  arrTz: string;
  depLatLon?: LatLon;
  arrLatLon?: LatLon;
}

export interface TripContext {
  legs: readonly Leg[];
  mustBeAwake: readonly Interval[];
  noWorkout: readonly Interval[];
  exerciseEnabled: boolean;
  meditationEnabled: boolean;
  zoneAt: (at: Instant) => string;
  /** Ground position at an instant; undefined when unknown or in the air. */
  latLonAt: (at: Instant) => LatLon | undefined;
}

export interface DayContext {
  index: number;
  sleepStart: Instant;
  wake: Instant;
  nextSleepStart: Instant;
}

export interface FilterResult {
  blocks: RawBlock[];
  flags: DayFlag[];
  warnings: WarningCode[];
  dropped: Array<{ kind: BlockKind; code: DropCode }>;
  advice: AdviceCode[];
  daylightUnknown: boolean;
}

const INFLIGHT_SLEEP_MINUTES = FEASIBILITY.inflightSleepHours * 60;
const SHORT_SLEEP_MINUTES = FEASIBILITY.shortSleepHours * 60;
const MIN_BLOCK_MINUTES = FEASIBILITY.minBlockMinutes;
const WALK_MINUTES = FEASIBILITY.walkMinutes;
const WALK_BEFORE_SLEEP_MINUTES = FEASIBILITY.walkBeforeSleepHours * 60;
const NSDR_WINDOW = WIND_DOWN.nsdrWindow;
const SUN_UP_ALTITUDE_DEG = DAYLIGHT.sunUpAltitudeDegrees;
const DAYLIGHT_SAMPLE_MINUTES = DAYLIGHT.sampleMinutes;

const INFLIGHT_ADVICE: readonly AdviceCode[] = [
  "INFLIGHT_WATER",
  "INFLIGHT_ALCOHOL",
  "INFLIGHT_WATCH",
  "INFLIGHT_EYE_MASK",
  "INFLIGHT_CABIN_LIGHT",
];

const MARKERS: ReadonlySet<BlockKind> = new Set(["CAFFEINE_STOP", "MEAL"]);

function clock(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function withSpan(b: RawBlock, span: Interval): RawBlock {
  return { ...b, start: span.start, end: span.end };
}

interface SleepClip {
  /** Sleep left after clipping, minutes (0 if none). */
  kept: number;
  nap: Interval | undefined;
  /** True when the nap is in the air (no 8 h rule). */
  inFlight: boolean;
}

/** Rule 1: flights. */
function applyFlights(
  blocks: RawBlock[],
  day: DayContext,
  trip: TripContext,
  out: FilterResult,
): { blocks: RawBlock[]; clip: SleepClip | undefined } {
  const flights: Interval[] = trip.legs.map((l) => ({
    start: l.start,
    end: l.end,
  }));
  let clip: SleepClip | undefined;
  const result: RawBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "SLEEP") {
      const inAir = flights.reduce((sum, f) => sum + overlapMinutes(b, f), 0);
      if (inAir >= INFLIGHT_SLEEP_MINUTES) {
        result.push({
          ...b,
          kind: "SLEEP_INFLIGHT",
          reasonCode: "SLEEP_INFLIGHT",
        });
      } else if (inAir > 0) {
        const kept = longest(subtract(b, flights));
        if (kept !== undefined) result.push(withSpan(b, kept));
        const flight = flights.find((f) => overlaps(b, f));
        const napStart =
          flight === undefined ? b.start : later(flight.start, b.start);
        clip = {
          kept: kept === undefined ? 0 : length(kept),
          nap:
            flight === undefined
              ? undefined
              : { start: napStart, end: flight.end },
          inFlight: true,
        };
      } else {
        result.push(b);
      }
      continue;
    }
    if (b.kind === "SEEK_LIGHT" || b.kind === "AVOID_LIGHT") {
      for (const ground of subtract(b, flights))
        result.push(withSpan(b, ground));
      for (const f of flights) {
        const air = intersection(b, f);
        if (air === undefined) continue;
        result.push(
          b.kind === "SEEK_LIGHT"
            ? {
                ...air,
                kind: "LIGHT_INFLIGHT_WINDOW",
                reasonCode: "LIGHT_INFLIGHT",
              }
            : {
                ...air,
                kind: "AVOID_LIGHT",
                reasonCode: "AVOID_LIGHT_INFLIGHT",
              },
        );
      }
      continue;
    }
    result.push(b);
  }

  const frame: Interval = { start: day.sleepStart, end: day.nextSleepStart };
  if (!flights.some((f) => overlaps(frame, f))) return { blocks: result, clip };

  // Flight day: static advice, an optional walk at the arrival airport
  // instead of exercise windows, and NSDR after a long flight.
  out.flags.push("FLIGHT_DAY");
  out.advice.push(...INFLIGHT_ADVICE);
  const onFlightDay = result.filter(
    (b) =>
      b.kind !== "EXERCISE_GOOD" &&
      !(
        b.kind === "EXERCISE_AVOID" &&
        b.reasonCode === "EXERCISE_AVOID_DIRECTION"
      ),
  );
  const arrivals = trip.legs.filter((l) =>
    contains({ start: day.wake, end: day.nextSleepStart }, l.end),
  );
  const lastArrival = arrivals[arrivals.length - 1];
  if (trip.exerciseEnabled && lastArrival !== undefined) {
    const end = plus(lastArrival.end, WALK_MINUTES);
    if (minutesBetween(end, day.nextSleepStart) >= WALK_BEFORE_SLEEP_MINUTES) {
      onFlightDay.push({
        kind: "EXERCISE_OPTIONAL_WALK",
        reasonCode: "EXERCISE_OPTIONAL_WALK",
        start: lastArrival.end,
        end,
      });
    }
  }
  if (trip.meditationEnabled) {
    const longHaul = arrivals.find(
      (l) => length(l) > WIND_DOWN.nsdrAfterFlightHours * 60,
    );
    if (longHaul !== undefined) {
      const date = longHaul.end
        .toZonedDateTimeISO(longHaul.arrTz)
        .toPlainDate();
      const start = later(
        plus(longHaul.end, NSDR_WINDOW.afterArrivalMinutes),
        instantAt(date, clock(NSDR_WINDOW.from), longHaul.arrTz),
      );
      const end = plus(start, WIND_DOWN.nsdrMinutes);
      const latest = instantAt(date, clock(NSDR_WINDOW.to), longHaul.arrTz);
      if (compare(end, latest) <= 0 && compare(end, day.nextSleepStart) <= 0) {
        onFlightDay.push({ kind: "NSDR", reasonCode: "NSDR", start, end });
      }
    }
  }
  return { blocks: onFlightDay, clip };
}

/** Rule 2: must-be-awake events, no-workout windows, melatonin moves. */
function applyMustBeAwake(
  blocks: RawBlock[],
  day: DayContext,
  trip: TripContext,
  clip: SleepClip | undefined,
  out: FilterResult,
): { blocks: RawBlock[]; clip: SleepClip | undefined } {
  const result: RawBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "SLEEP") {
      const events = trip.mustBeAwake.filter((e) => overlaps(b, e));
      if (events.length === 0) {
        result.push(b);
        continue;
      }
      const kept = longest(subtract(b, events));
      if (kept !== undefined) result.push(withSpan(b, kept));
      const lastEnd = events
        .map((e) => e.end)
        .reduce((a, e) => (compare(e, a) > 0 ? e : a));
      // The nap follows both the event and whatever sleep is left.
      const napStart = kept === undefined ? lastEnd : later(lastEnd, kept.end);
      clip = {
        kept: kept === undefined ? 0 : length(kept),
        nap: { start: napStart, end: day.nextSleepStart },
        inFlight: false,
      };
      continue;
    }
    if (b.kind === "MELATONIN_WINDOW") {
      const events = trip.mustBeAwake.filter((e) => overlaps(b, e));
      if (events.length === 0) {
        result.push(b);
        continue;
      }
      const lastEnd = events
        .map((e) => e.end)
        .reduce((a, e) => (compare(e, a) > 0 ? e : a));
      const moved = { start: lastEnd, end: plus(lastEnd, length(b)) };
      if (compare(moved.end, day.nextSleepStart) > 0) {
        out.dropped.push({ kind: b.kind, code: "MELATONIN_NO_WINDOW" });
      } else {
        out.warnings.push("MELATONIN_MOVED");
        result.push(withSpan(b, moved));
      }
      continue;
    }
    if (b.kind === "EXERCISE_GOOD" || b.kind === "EXERCISE_OPTIONAL_WALK") {
      const kept = longest(subtract(b, trip.noWorkout));
      if (kept === undefined || length(kept) < MIN_BLOCK_MINUTES) {
        out.dropped.push({ kind: b.kind, code: "TRIMMED" });
      } else {
        result.push(withSpan(b, kept));
      }
      continue;
    }
    result.push(b);
  }

  if (
    clip !== undefined &&
    clip.kept < SHORT_SLEEP_MINUTES &&
    clip.nap !== undefined
  ) {
    out.flags.push("SHORT_SLEEP_DAY");
    out.warnings.push("SHORT_SLEEP_DAY");
    const minutes =
      clip.kept < NAP.shortSleepHours * 60
        ? NAP.minutesAfterShortSleep
        : NAP.minutes;
    // §2.5: never nap in a seek-light block; start after any it would hit.
    let start = clip.nap.start;
    for (const light of result
      .filter((b) => LIGHT_SEEKING.has(b.kind))
      .sort((x, y) => compare(x.start, y.start))) {
      if (overlaps(light, { start, end: plus(start, minutes) })) {
        start = later(start, light.end);
      }
    }
    const end = clip.inFlight
      ? plus(start, Math.min(minutes, minutesBetween(start, clip.nap.end)))
      : plus(start, minutes);
    const tooLate =
      !clip.inFlight &&
      minutesBetween(end, day.nextSleepStart) < NAP.endBeforeSleepHours * 60;
    if (tooLate || minutesBetween(start, end) <= 0) {
      out.dropped.push({ kind: "NAP", code: "NAP_TOO_LATE" });
    } else {
      result.push({ kind: "NAP", reasonCode: "NAP_SHORT_SLEEP", start, end });
    }
  }
  return { blocks: result, clip };
}

function isDark(epochMs: number, where: LatLon): boolean {
  return (
    getPosition(new Date(epochMs), where.lat, where.lon).altitude <
    SUN_UP_ALTITUDE_DEG
  );
}

/** Dark sub-intervals of a span, sampled every few minutes at midpoints. */
function darkParts(span: Interval, where: LatLon): Interval[] {
  // Plain epoch arithmetic: this is the engine's hottest loop.
  const step = DAYLIGHT_SAMPLE_MINUTES * 60_000;
  const from = span.start.epochMilliseconds;
  const to = span.end.epochMilliseconds;
  const ranges: Array<[number, number]> = [];
  for (let t = from; t < to; t += step) {
    const end = Math.min(t + step, to);
    if (!isDark((t + end) / 2, where)) continue;
    const last = ranges[ranges.length - 1];
    if (last !== undefined && last[1] === t) last[1] = end;
    else ranges.push([t, end]);
  }
  return ranges.map(([s, e]) => ({
    start: Temporal.Instant.fromEpochMilliseconds(s),
    end: Temporal.Instant.fromEpochMilliseconds(e),
  }));
}

/** Rule 3: daylight. */
function applyDaylight(
  blocks: RawBlock[],
  trip: TripContext,
  out: FilterResult,
): RawBlock[] {
  const result: RawBlock[] = [];
  let dimNote = false;
  for (const b of blocks) {
    const ground =
      b.kind === "SEEK_LIGHT" ||
      (b.kind === "AVOID_LIGHT" && b.reasonCode !== "AVOID_LIGHT_INFLIGHT");
    if (!ground) {
      result.push(b);
      continue;
    }
    const where = trip.latLonAt(b.start);
    if (where === undefined) {
      out.daylightUnknown = true;
      result.push(b);
      continue;
    }
    const dark = darkParts(b, where);
    if (b.kind === "SEEK_LIGHT") {
      result.push(
        dark.length > 0
          ? {
              ...b,
              kind: "SEEK_LIGHT_ARTIFICIAL",
              reasonCode: "SEEK_LIGHT_ARTIFICIAL",
            }
          : b,
      );
      continue;
    }
    if (dark.length > 0) dimNote = true;
    for (const lit of subtract(b, dark)) result.push(withSpan(b, lit));
  }
  if (dimNote) out.advice.push("KEEP_LIGHTS_DIM");
  return result;
}

const HARD_SLEEP: ReadonlySet<BlockKind> = new Set(["SLEEP", "SLEEP_INFLIGHT"]);

/** Blocks that occupy the traveler's time, in §2.7 rule 4 priority order. */
const OCCUPYING_RANK: Partial<Record<BlockKind, number>> = {
  AVOID_LIGHT: 1,
  SEEK_LIGHT: 2,
  SEEK_LIGHT_ARTIFICIAL: 2,
  LIGHT_INFLIGHT_WINDOW: 2,
  EXERCISE_GOOD: 4,
  EXERCISE_OPTIONAL_WALK: 4,
  NAP: 6,
  NSDR: 7,
  WIND_DOWN: 7,
};

const LIGHT_SEEKING: ReadonlySet<BlockKind> = new Set([
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
]);
const EXERCISING: ReadonlySet<BlockKind> = new Set([
  "EXERCISE_GOOD",
  "EXERCISE_OPTIONAL_WALK",
]);
const RESTING: ReadonlySet<BlockKind> = new Set(["WIND_DOWN", "NSDR"]);

const NAPPING: ReadonlySet<BlockKind> = new Set(["NAP"]);
const AVOIDING: ReadonlySet<BlockKind> = new Set(["AVOID_LIGHT"]);

/**
 * Which occupying blocks cannot share time (maintainer-approved T04 rule):
 * seek vs avoid light, naps vs seek light / exercise / rest, exercise vs rest.
 * A nap inside avoid-light is fine (it is dim).
 */
function conflicts(a: BlockKind, b: BlockKind): boolean {
  const pair = (
    x: ReadonlySet<BlockKind>,
    y: ReadonlySet<BlockKind>,
  ): boolean => (x.has(a) && y.has(b)) || (x.has(b) && y.has(a));
  return (
    pair(AVOIDING, LIGHT_SEEKING) ||
    pair(NAPPING, LIGHT_SEEKING) ||
    pair(NAPPING, EXERCISING) ||
    pair(NAPPING, RESTING) ||
    pair(EXERCISING, RESTING)
  );
}

/** Rule 4: block collisions. */
function applyCollisions(blocks: RawBlock[], out: FilterResult): RawBlock[] {
  const placed: RawBlock[] = blocks.filter((b) => HARD_SLEEP.has(b.kind));
  const byTime = (x: RawBlock, y: RawBlock): number =>
    compare(x.start, y.start);
  const occupying = blocks
    .filter((b) => OCCUPYING_RANK[b.kind] !== undefined)
    .sort(
      (x, y) =>
        (OCCUPYING_RANK[x.kind] ?? 0) - (OCCUPYING_RANK[y.kind] ?? 0) ||
        byTime(x, y),
    );
  for (const b of occupying) {
    const blockers = placed.filter(
      (p) => HARD_SLEEP.has(p.kind) || conflicts(b.kind, p.kind),
    );
    const kept = subtract(b, blockers).filter(
      (s) => length(s) >= MIN_BLOCK_MINUTES,
    );
    if (kept.length === 0) out.dropped.push({ kind: b.kind, code: "TRIMMED" });
    for (const s of kept) placed.push(withSpan(b, s));
  }
  // Advisory windows (caffeine, meals, melatonin, exercise-avoid) only give
  // way to sleep and naps.
  const sleeping = placed.filter(
    (p) => HARD_SLEEP.has(p.kind) || p.kind === "NAP",
  );
  for (const b of blocks) {
    if (HARD_SLEEP.has(b.kind) || OCCUPYING_RANK[b.kind] !== undefined)
      continue;
    const segments = subtract(b, sleeping);
    const kept = MARKERS.has(b.kind)
      ? segments.filter((s) => length(s) === length(b))
      : segments.filter((s) => length(s) >= MIN_BLOCK_MINUTES);
    if (kept.length === 0) out.dropped.push({ kind: b.kind, code: "TRIMMED" });
    for (const s of kept) placed.push(withSpan(b, s));
  }
  return placed.sort(byTime);
}

export function feasibilityPass(
  raw: RawBlock[],
  day: DayContext,
  trip: TripContext,
): FilterResult {
  const out: FilterResult = {
    blocks: [],
    flags: [],
    warnings: [],
    dropped: [],
    advice: [],
    daylightUnknown: false,
  };
  const flights = applyFlights(raw, day, trip, out);
  const awake = applyMustBeAwake(flights.blocks, day, trip, flights.clip, out);
  const lit = applyDaylight(awake.blocks, trip, out);
  out.blocks = applyCollisions(lit, out);
  return out;
}
