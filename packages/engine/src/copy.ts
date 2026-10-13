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

// Every user-facing string the engine emits. Plain, second person, present
// tense; describes windows and what research suggests, never instructs a
// quantity (§5, §11.3, §11.4). The switches are exhaustive: adding a code
// without copy fails typecheck.

import type { Direction, ReasonCode, WarningCode } from "./types";

/** Fixed by §2.5; do not edit. */
export const MELATONIN_REASON =
  "If you use melatonin, research on timing suggests this window.";

export function reasonCopy(code: ReasonCode): string {
  switch (code) {
    case "SLEEP_SHIFTING":
      return "Sleep in this window; it moves a little each day with your clock.";
    case "SLEEP_SETTLED":
      return "Sleep in this window; your clock is now on destination time.";
    case "SLEEP_HOME_TIME":
      return "Sleep on your home schedule; this trip is too short to shift your clock.";
    case "SLEEP_LOCAL_TIME":
      return "Sleep on local time; the time difference is too small to need a shift.";
    case "SEEK_LIGHT_ADVANCE":
      return "Bright light now pulls your clock earlier.";
    case "SEEK_LIGHT_DELAY":
      return "Bright light now pushes your clock later.";
    case "AVOID_LIGHT_ADVANCE":
      return "Light now would push your clock later, so keep it dim.";
    case "AVOID_LIGHT_DELAY":
      return "Light now would pull your clock earlier, so keep it dim or wear sunglasses.";
    case "MELATONIN_WINDOW":
      return MELATONIN_REASON;
    case "EXERCISE_GOOD_ADVANCE":
      return "Exercise in this window can help move your clock earlier.";
    case "EXERCISE_GOOD_DELAY":
      return "Exercise in this window can help move your clock later.";
    case "EXERCISE_AVOID_DIRECTION":
      return "Exercise now would nudge your clock the wrong way.";
    case "EXERCISE_AVOID_BEDTIME":
      return "Exercise this close to bedtime can make it harder to fall asleep.";
    case "EXERCISE_AVOID_EVENING":
      return "Exercise now would nudge your clock the wrong way, and later it can make it harder to fall asleep.";
    case "CAFFEINE_OK":
      return "Caffeine fits in this window.";
    case "CAFFEINE_STOP":
      return "Last caffeine here, so it does not keep you awake tonight.";
    case "MEAL":
      return "A meal around now fits your new schedule.";
    case "WIND_DOWN":
      return "Wind down here: dim the lights and slow down before sleep.";
    case "SLEEP_INFLIGHT":
      return "Sleep on the plane in this window; an eye mask helps.";
    case "LIGHT_INFLIGHT":
      return "Light now helps your clock; open the window shade if it's bright outside.";
    case "AVOID_LIGHT_INFLIGHT":
      return "Keep light out now: close the window shade or wear an eye mask.";
    case "SEEK_LIGHT_ARTIFICIAL":
      return "It's dark outside, so bright indoor light or a 10 000 lux lamp does the job now.";
    case "NAP_SHORT_SLEEP":
      return "A short nap here makes up for a short night.";
    case "NSDR":
      return "A short rest here helps after a long flight; you don't need to fall asleep.";
    case "EXERCISE_OPTIONAL_WALK":
      return "An easy walk after landing, if you feel like it.";
    case "CAFFEINE_LATE_OK":
      return "Caffeine still fits here today while your clock catches up.";
  }
}

export function warningCopy(code: WarningCode): string {
  switch (code) {
    case "PHASE_ESTIMATE_UNCERTAIN":
      return "Your sleep times don't match your chronotype, so the plan uses your sleep times and keeps wider margins around light.";
    case "LIGHT_BLOCK_SHIFTED":
      return "The best light time falls while you sleep, so light windows sit just before your sleep instead.";
    case "SLEEP_BEFORE_FLIGHT":
      return "Your night ends 3 hours before your flight so you have time to get to the airport. Bedtime moves up to an hour earlier, and if the night is still short the plan adds a nap.";
    case "SHORT_SLEEP_DAY":
      return "Your sleep window is short today, so the plan adds a nap.";
    case "MELATONIN_MOVED":
      return "The melatonin window clashed with something you must be awake for, so it moved to just after it.";
    case "WEAK_DAY":
      return "Today has no light window at the right time, so the plan expects a smaller shift and may run longer.";
    case "DAYLIGHT_UNKNOWN":
      return "Airport locations are missing, so light windows don't account for daylight.";
  }
}

export const ADVICE_CODES = [
  "INFLIGHT_WATER",
  "INFLIGHT_ALCOHOL",
  "INFLIGHT_WATCH",
  "INFLIGHT_EYE_MASK",
  "INFLIGHT_CABIN_LIGHT",
  "KEEP_LIGHTS_DIM",
] as const;

export type AdviceCode = (typeof ADVICE_CODES)[number];

/** Static, unscheduled advice (§2.5 in-flight list, §2.7 rule 3 note). */
export function adviceCopy(code: AdviceCode): string {
  switch (code) {
    case "INFLIGHT_WATER":
      return "Drink water regularly during the flight.";
    case "INFLIGHT_ALCOHOL":
      return "Skip alcohol on board; it makes sleep lighter and more broken.";
    case "INFLIGHT_WATCH":
      return "Set your watch to destination time when you board.";
    case "INFLIGHT_EYE_MASK":
      return "Use an eye mask during avoid-light windows on board.";
    case "INFLIGHT_CABIN_LIGHT":
      return "Cabin lighting varies by airline, so in-flight light windows are a rough guide.";
    case "KEEP_LIGHTS_DIM":
      return "It's dark outside during part of your avoid-light time; keep indoor lights dim.";
  }
}

export const DROP_CODES = [
  "MELATONIN_NO_WINDOW",
  "TRIMMED",
  "NAP_TOO_LATE",
] as const;

export type DropCode = (typeof DROP_CODES)[number];

export function droppedCopy(code: DropCode): string {
  switch (code) {
    case "MELATONIN_NO_WINDOW":
      return "No melatonin window today: the useful time falls too close to your sleep.";
    case "TRIMMED":
      return "It overlapped a more important window and was too short to keep.";
    case "NAP_TOO_LATE":
      return "No nap today: the only time for it is too close to tonight's sleep.";
  }
}

function hours(h: number): string {
  return `${Number.isInteger(h) ? h.toFixed(0) : h.toFixed(1)} h`;
}

function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

function word(direction: Direction): string {
  return direction === "advance" ? "earlier" : "later";
}

export const explanationCopy = {
  shift(args: {
    direction: Direction;
    shiftHours: number;
    days: number;
    otherShiftHours: number;
    otherDays: number;
    forced: boolean;
  }): string {
    const other: Direction = args.direction === "advance" ? "delay" : "advance";
    if (args.forced) {
      return `You chose to move your clock ${hours(args.shiftHours)} ${word(args.direction)} over ${days(args.days)}.`;
    }
    // Shown only when the long way round wins (antidromic choice).
    if (args.shiftHours > args.otherShiftHours) {
      const saved = args.otherDays - args.days;
      return `We'll move your clock ${hours(args.shiftHours)} ${word(args.direction)} instead of ${hours(args.otherShiftHours)} ${word(other)} because it finishes ${days(saved)} sooner.`;
    }
    return `We'll move your clock ${hours(args.shiftHours)} ${word(args.direction)} over ${days(args.days)}.`;
  },
  lightTouch(deltaHours: number): string {
    return `The time difference is ${hours(Math.abs(deltaHours))}, so there is no shift plan: sleep on local time.`;
  },
  shortTrip(args: { tripDays: number; shiftDays: number }): string {
    // Trips of 2 days or less are short whatever the shift would take (§2.3).
    const why =
      args.shiftDays >= args.tripDays
        ? `Your trip is ${days(args.tripDays)} and shifting would take ${days(args.shiftDays)}`
        : `Your trip is ${days(args.tripDays)}, too short to be worth shifting your clock`;
    return `${why}, so the plan keeps you on home time. You can switch to a full shift.`;
  },
} as const;
