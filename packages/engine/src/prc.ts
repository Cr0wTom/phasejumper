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

// The model (spec §2.2–§2.5). All offsets are hours relative to CBTmin
// (0 = CBTmin) unless the name says otherwise. Do not change these values
// without updating the spec and the golden fixtures.

/** Phase estimate from habitual sleep. Source: R1. */
export const PHASE = {
  /** DLMO ≈ habitual bedtime − 2 h. */
  dlmoBeforeBedtimeHours: 2,
  /** CBTmin ≈ habitual wake − 2.5 h. */
  cbtMinBeforeWakeHours: 2.5,
  /** Applied to CBTmin. */
  chronotypeOffsetHours: { morning: -0.75, intermediate: 0, evening: 0.75 },
  /**
   * Sleep-midpoint sanity check. The spec's original "midpoint − 4.5 h" was a
   * typo (it disagrees with the formulas above by ~5.75 h for every sleeper);
   * with CBTmin = wake − 2.5 h and an 8 h sleep, CBTmin = midpoint + 1.5 h.
   */
  midpointToCbtMinHours: 1.5,
  /** Use the midpoint estimate when the two disagree by more than this. */
  midpointToleranceHours: 1.5,
  uncertaintyHours: 1.0,
  uncertaintyHoursWhenUnsure: 1.5,
  defaultSleepNeedHours: 8,
} as const;

/** Below this |delta| there is no shifting plan (§2.3). */
export const LIGHT_TOUCH_THRESHOLD_HOURS = 2;
/** Short-trip floor: tripDays ≤ max(this, chosenDays) (§2.3). */
export const SHORT_TRIP_MIN_DAYS = 2;

/** Shift rates in hours/day with light correctly timed. Sources: R1, R5. */
export const RATES = {
  advance: { withoutMelatonin: 1.0, withMelatonin: 1.5 },
  delay: { withoutMelatonin: 2.0, withMelatonin: 2.0 },
} as const;

/** Light PRC. Sources: R2, R3. Crossover at CBTmin. */
export const LIGHT = {
  advanceZone: [0, 6],
  advancePeak: [1, 4],
  delayZone: [-6, 0],
  delayPeak: [-4, -1],
  deadZone: [8, 14],
  seekMinutes: 60,
  maxBlockMinutes: 90,
  /** Advancing: SEEK_LIGHT starts at max(CBTmin + 1 h, wake). */
  seekAdvanceStartHours: 1,
  /** Delaying: SEEK_LIGHT ends at CBTmin − 1 h. */
  seekDelayEndHours: -1,
  /** Advancing: AVOID_LIGHT covers the delay zone. */
  avoidWhenAdvancing: [-6, 0],
  /** Delaying: AVOID_LIGHT covers the advance zone. */
  avoidWhenDelaying: [0, 6],
} as const;

/** Melatonin timing. Sources: R4, R5. Timing only: no amount anywhere in the engine. */
export const MELATONIN = {
  /** Advancing: window starts at sleepStart − 5.5 h (≈ DLMO − 3.5 h). */
  advanceBeforeSleepHours: 5.5,
  windowMinutes: 30,
  /** Never earlier than this local time. */
  earliestLocalTime: "13:00",
  /** Delaying (opt-in): window within this many minutes of wake. */
  delayAfterWakeMinutes: 30,
} as const;

/**
 * Exercise PRC. Source: R9.
 * ASSUMPTION: derived from R9 clock times assuming CBTmin≈04:30 (study sleep
 * ≈ 23:00–07:00). The morning advance point (+2.5, "7 am") is used as a 1 h
 * zone centred on it.
 */
export const EXERCISE = {
  advanceMorningZone: [2, 3],
  advanceAfternoonZone: [8.5, 11.5],
  delayZone: [14.5, 17.5],
  defaultMinutes: 45,
  /** No exercise in the 3 h before sleep (sleep hygiene; §11.3 item 5). */
  avoidBeforeSleepHours: 3,
  /** Forecast weight relative to light (§2.8). */
  bonusShiftHours: 0.3,
} as const;

/** Caffeine. Sources: R10, R11. */
export const CAFFEINE = {
  stopBeforeSleepHours: { normal: 8, heavy: 9 },
  /** Advancing: late caffeine blocks advances, so stop by CBTmin + 8 h. */
  advanceStopAfterCbtMinHours: 8,
  /** Delaying and behind schedule: CAFFEINE_LATE_OK ends at sleepStart − 6 h (T04). */
  lateOkBeforeSleepHours: 6,
} as const;

/** Naps. Source: R12. Placed by the feasibility pass (T04). */
export const NAP = {
  minutes: 20,
  minutesAfterShortSleep: 90,
  shortSleepHours: 4,
  endBeforeSleepHours: 8,
} as const;

/** Meals (opt-in, grade C): markers only. */
export const MEALS = {
  afterWakeHours: 1,
  lastBeforeSleepHours: 3,
} as const;

/** Wind-down and NSDR (opt-in, grade C). */
export const WIND_DOWN = {
  defaultMinutes: 15,
  nsdrMinutes: 20,
  nsdrAfterFlightHours: 8,
} as const;

/** Point events (caffeine stop, meals) are emitted as short blocks. */
export const MARKER_MINUTES = 5;
