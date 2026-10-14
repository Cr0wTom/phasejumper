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

// §2.2 phase estimate, §2.3 required shift, §2.4 direction choice.
// Everything is computed in whole minutes so results are exact.

import { Temporal } from "temporal-polyfill";
import {
  LIGHT_TOUCH_THRESHOLD_HOURS,
  PHASE,
  RATES,
  SHORT_TRIP_MIN_DAYS,
} from "./prc";
import type {
  DecisionDirection,
  Direction,
  EngineOptions,
  LatLon,
  PlanInput,
  Traveler,
} from "./types";

export const MINUTES_PER_DAY = 1440;

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "23:30" → 1410, or undefined if malformed. */
export function parseClock(value: string): number | undefined {
  const match = CLOCK.exec(value);
  if (match === null) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(minutes: number): string {
  const m = wrapMinutes(minutes);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Into [0, 1440). */
export function wrapMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Into (−720, 720]. */
export function signedMinutes(minutes: number): number {
  const m = wrapMinutes(minutes);
  return m > MINUTES_PER_DAY / 2 ? m - MINUTES_PER_DAY : m;
}

export interface PhaseEstimate {
  /** CBTmin as a clock time, minutes after midnight. */
  cbtMinClock: number;
  /** Wake time relative to CBTmin, minutes. */
  wakeAfterCbtMin: number;
  sleepNeedMinutes: number;
  uncertaintyMinutes: number;
  /** True when PHASE_ESTIMATE_UNCERTAIN fires. */
  uncertain: boolean;
}

/** §2.2. Assumes validated input. */
export function estimatePhase(traveler: Traveler): PhaseEstimate {
  const bed = parseClock(traveler.habitualBedtime) ?? 0;
  const wake = parseClock(traveler.habitualWake) ?? 0;
  const chronotypeOffset =
    PHASE.chronotypeOffsetHours[traveler.chronotype] * 60;
  const fromWake = wrapMinutes(
    wake - PHASE.cbtMinBeforeWakeHours * 60 + chronotypeOffset,
  );
  const habitualSleep = wrapMinutes(wake - bed);
  const midpoint = wrapMinutes(bed + Math.round(habitualSleep / 2));
  const fromMidpoint = wrapMinutes(midpoint + PHASE.midpointToCbtMinHours * 60);
  const uncertain =
    Math.abs(signedMinutes(fromWake - fromMidpoint)) >
    PHASE.midpointToleranceHours * 60;
  const cbtMinClock = uncertain ? fromMidpoint : fromWake;
  return {
    cbtMinClock,
    wakeAfterCbtMin: signedMinutes(wake - cbtMinClock),
    sleepNeedMinutes: Math.round(
      (traveler.sleepNeedHours ?? PHASE.defaultSleepNeedHours) * 60,
    ),
    uncertaintyMinutes:
      (uncertain ? PHASE.uncertaintyHoursWhenUnsure : PHASE.uncertaintyHours) *
      60,
    uncertain,
  };
}

/** Minutes after local midnight of an instant in a zone. */
export function clockIn(instant: Temporal.Instant, timeZone: string): number {
  const z = instant.toZonedDateTimeISO(timeZone);
  return z.hour * 60 + z.minute;
}

/** UTC offset of a zone at an instant, minutes. */
export function offsetMinutes(
  instant: Temporal.Instant,
  timeZone: string,
): number {
  return Math.round(
    instant.toZonedDateTimeISO(timeZone).offsetNanoseconds / 60_000_000_000,
  );
}

/** The instant at a clock time on a local date. */
export function instantAt(
  date: Temporal.PlainDate,
  clockMinutes: number,
  timeZone: string,
): Temporal.Instant {
  const time = new Temporal.PlainTime(
    Math.floor(clockMinutes / 60),
    clockMinutes % 60,
  );
  return date.toZonedDateTime({ timeZone, plainTime: time }).toInstant();
}

export interface DirectionDecision {
  direction: DecisionDirection;
  /** The direction whose rate and shift drive the day loop (also for short-trip). */
  shiftDirection: Direction;
  deltaMinutes: number;
  advanceMinutes: number;
  delayMinutes: number;
  daysAdvance: number;
  daysDelay: number;
  rateMinutes: Record<Direction, number>;
  forced: boolean;
}

export function ratesFor(traveler: Traveler): Record<Direction, number> {
  const melatonin =
    traveler.useMelatonin && traveler.melatoninContraindicated !== true;
  return {
    advance:
      (melatonin
        ? RATES.advance.withMelatonin
        : RATES.advance.withoutMelatonin) * 60,
    delay:
      (melatonin ? RATES.delay.withMelatonin : RATES.delay.withoutMelatonin) *
      60,
  };
}

/** §2.3–2.4. deltaMinutes > 0: the clock must move earlier. */
export function chooseDirection(
  deltaMinutes: number,
  rateMinutes: Record<Direction, number>,
  tripDays: number | undefined,
  opts: EngineOptions,
): DirectionDecision {
  // §2.4 as written covers delta > 0 only; westward (delta < 0) mirrors it.
  const advanceMinutes =
    deltaMinutes >= 0 ? deltaMinutes : MINUTES_PER_DAY + deltaMinutes;
  const delayMinutes =
    deltaMinutes >= 0 ? MINUTES_PER_DAY - deltaMinutes : -deltaMinutes;
  const daysAdvance = Math.ceil(advanceMinutes / rateMinutes.advance);
  const daysDelay = Math.ceil(delayMinutes / rateMinutes.delay);
  const best: Direction = daysAdvance <= daysDelay ? "advance" : "delay";
  const shiftDirection = opts.forceDirection ?? best;
  const chosenDays = shiftDirection === "advance" ? daysAdvance : daysDelay;
  const base = {
    shiftDirection,
    deltaMinutes,
    advanceMinutes,
    delayMinutes,
    daysAdvance,
    daysDelay,
    rateMinutes,
    forced: opts.forceDirection !== undefined,
  };
  if (Math.abs(deltaMinutes) < LIGHT_TOUCH_THRESHOLD_HOURS * 60) {
    return { ...base, direction: "none", forced: false };
  }
  if (
    opts.forceDirection === undefined &&
    tripDays !== undefined &&
    tripDays <= Math.max(SHORT_TRIP_MIN_DAYS, chosenDays)
  ) {
    return { ...base, direction: "short-trip" };
  }
  return { ...base, direction: shiftDirection };
}

export type ValidationResult = { ok: true } | { ok: false; issues: string[] };

function validZone(timeZone: string): boolean {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

function localInstant(
  value: string,
  timeZone: string,
): Temporal.Instant | undefined {
  try {
    return Temporal.PlainDateTime.from(value)
      .toZonedDateTime(timeZone)
      .toInstant();
  } catch {
    return undefined;
  }
}

function validLatLon(p: LatLon): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

function positiveFinite(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value > 0);
}

/**
 * Structural checks the engine relies on. The app validates with zod first;
 * this is the engine's own guard so it never computes on bad input.
 */
export function validatePlanInput(input: PlanInput): ValidationResult {
  const issues: string[] = [];
  const t = input.traveler;
  const bed = parseClock(t.habitualBedtime);
  const wake = parseClock(t.habitualWake);
  if (bed === undefined) issues.push("traveler.habitualBedtime must be HH:MM");
  if (wake === undefined) issues.push("traveler.habitualWake must be HH:MM");
  if (bed !== undefined && wake !== undefined && bed === wake) {
    issues.push("traveler.habitualBedtime and habitualWake must differ");
  }
  if (
    t.sleepNeedHours !== undefined &&
    !(
      Number.isFinite(t.sleepNeedHours) &&
      t.sleepNeedHours > 0 &&
      t.sleepNeedHours < 24
    )
  ) {
    issues.push("traveler.sleepNeedHours must be between 0 and 24");
  }
  if (
    t.arrivalStyle !== undefined &&
    t.arrivalStyle !== "body-clock" &&
    t.arrivalStyle !== "local"
  ) {
    issues.push('traveler.arrivalStyle must be "body-clock" or "local"');
  }
  if (![0, 1, 2, 3].includes(t.preAdjustDays)) {
    issues.push("traveler.preAdjustDays must be 0, 1, 2 or 3");
  }
  if (!positiveFinite(t.exercise.preferredMinutes)) {
    issues.push("traveler.exercise.preferredMinutes must be positive");
  }
  if (!positiveFinite(t.meditation.minutes)) {
    issues.push("traveler.meditation.minutes must be positive");
  }

  const it = input.itinerary;
  if (!validZone(it.homeTz))
    issues.push("itinerary.homeTz is not an IANA zone");
  if (!validZone(it.destinationTz)) {
    issues.push("itinerary.destinationTz is not an IANA zone");
  }
  if (
    it.tripDays !== undefined &&
    !(Number.isInteger(it.tripDays) && it.tripDays > 0)
  ) {
    issues.push("itinerary.tripDays must be a positive integer");
  }
  if (it.legs.length === 0) issues.push("itinerary.legs must not be empty");
  let previousArrival: Temporal.Instant | undefined;
  it.legs.forEach((leg, i) => {
    const at = `itinerary.legs[${i}]`;
    if (!validZone(leg.departureTz)) {
      issues.push(`${at}.departureTz is not an IANA zone`);
      return;
    }
    if (!validZone(leg.arrivalTz)) {
      issues.push(`${at}.arrivalTz is not an IANA zone`);
      return;
    }
    const dep = localInstant(leg.departureLocal, leg.departureTz);
    const arr = localInstant(leg.arrivalLocal, leg.arrivalTz);
    if (dep === undefined)
      issues.push(`${at}.departureLocal is not a date-time`);
    if (arr === undefined) issues.push(`${at}.arrivalLocal is not a date-time`);
    if (dep === undefined || arr === undefined) return;
    if (Temporal.Instant.compare(arr, dep) <= 0) {
      issues.push(`${at} arrives before it departs`);
    }
    if (
      previousArrival !== undefined &&
      Temporal.Instant.compare(dep, previousArrival) < 0
    ) {
      issues.push(`${at} departs before the previous leg arrives`);
    }
    for (const [field, value] of [
      ["departureLatLon", leg.departureLatLon],
      ["arrivalLatLon", leg.arrivalLatLon],
    ] as const) {
      if (value !== undefined && !validLatLon(value)) {
        issues.push(`${at}.${field} is not a valid latitude/longitude`);
      }
    }
    previousArrival = arr;
  });

  const c = input.constraints;
  const windows = [
    ...(c?.mustBeAwake ?? []).map(
      (w, i) => [`constraints.mustBeAwake[${i}]`, w] as const,
    ),
    ...(c?.noWorkoutWindows ?? []).map(
      (w, i) => [`constraints.noWorkoutWindows[${i}]`, w] as const,
    ),
  ];
  for (const [at, w] of windows) {
    if (!validZone(w.tz)) {
      issues.push(`${at}.tz is not an IANA zone`);
      continue;
    }
    const start = localInstant(w.start, w.tz);
    const end = localInstant(w.end, w.tz);
    if (start === undefined || end === undefined) {
      issues.push(`${at} start/end must be local date-times`);
    } else if (Temporal.Instant.compare(end, start) <= 0) {
      issues.push(`${at} ends before it starts`);
    }
  }

  try {
    Temporal.Instant.from(input.now);
  } catch {
    issues.push("now is not an ISO instant");
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export class EngineInputError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid plan input: ${issues.join("; ")}`);
    this.name = "EngineInputError";
    this.issues = issues;
  }
}

/** Departure/arrival instants of each leg; input must be validated. */
export function legInstants(input: PlanInput): Array<{
  dep: Temporal.Instant;
  arr: Temporal.Instant;
  depTz: string;
  arrTz: string;
}> {
  return input.itinerary.legs.map((leg) => ({
    dep: Temporal.PlainDateTime.from(leg.departureLocal)
      .toZonedDateTime(leg.departureTz)
      .toInstant(),
    arr: Temporal.PlainDateTime.from(leg.arrivalLocal)
      .toZonedDateTime(leg.arrivalTz)
      .toInstant(),
    depTz: leg.departureTz,
    arrTz: leg.arrivalTz,
  }));
}
