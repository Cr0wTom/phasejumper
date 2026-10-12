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
    case "CAFFEINE_OK":
      return "Caffeine fits in this window.";
    case "CAFFEINE_STOP":
      return "Last caffeine here, so it does not keep you awake tonight.";
    case "MEAL":
      return "A meal around now fits your new schedule.";
    case "WIND_DOWN":
      return "Wind down here: dim the lights and slow down before sleep.";
  }
}

export function warningCopy(code: WarningCode): string {
  switch (code) {
    case "PHASE_ESTIMATE_UNCERTAIN":
      return "Your sleep times don't match your chronotype, so the plan uses your sleep times and keeps wider margins around light.";
    case "LIGHT_BLOCK_SHIFTED":
      return "The best light time falls while you sleep, so the light window moved next to your sleep.";
  }
}

export const DROP_CODES = ["MELATONIN_NO_WINDOW"] as const;

export type DropCode = (typeof DROP_CODES)[number];

export function droppedCopy(code: DropCode): string {
  switch (code) {
    case "MELATONIN_NO_WINDOW":
      return "No melatonin window today: the useful time falls too close to your sleep.";
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
