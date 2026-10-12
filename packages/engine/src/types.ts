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

// Public data contract of @phasejumper/engine (spec §2.1, §2.6, §2.8).
// All instants are ISO-8601 UTC strings ("2027-01-15T03:30:00Z"); wall-clock
// conversion happens only at the edges (rendering, iCal).

export type Chronotype = "morning" | "intermediate" | "evening";
export type CaffeineUse = "none" | "normal" | "heavy";
export type PreAdjustDays = 0 | 1 | 2 | 3;

export interface Traveler {
  /** "23:30", local at origin on a normal day. */
  habitualBedtime: string;
  /** "07:00", local at origin on a normal day. */
  habitualWake: string;
  chronotype: Chronotype;
  /** Default 8. */
  sleepNeedHours?: number;
  /** Set only when the traveler says they already use melatonin (§2.5). */
  useMelatonin: boolean;
  /** Pregnancy, medication or under 18: the melatonin layer is hard-blocked. */
  melatoninContraindicated?: boolean;
  caffeine: CaffeineUse;
  exercise: {
    enabled: boolean;
    preferredMinutes?: number;
    intensity?: "light" | "moderate" | "vigorous";
  };
  meditation: { enabled: boolean; minutes?: number };
  mealTiming: { enabled: boolean };
  preAdjustDays: PreAdjustDays;
}

export interface FlightLeg {
  /** IATA. */
  departureAirport: string;
  /** IATA. */
  arrivalAirport: string;
  /** ISO local wall time at the departure airport, e.g. "2027-01-15T10:30". */
  departureLocal: string;
  /** ISO local wall time at the arrival airport. */
  arrivalLocal: string;
  /** IANA zone, resolved by the app. */
  departureTz: string;
  /** IANA zone, resolved by the app. */
  arrivalTz: string;
  flightNumber?: string;
  /** V2. */
  cabinLightingKnown?: boolean;
}

export interface Itinerary {
  /** IANA, e.g. "Europe/Prague". */
  homeTz: string;
  /** At least one leg, chronologically sorted. */
  legs: FlightLeg[];
  /** IANA zone of the final destination. */
  destinationTz: string;
  returnLegs?: FlightLeg[];
  /** Days at destination; drives short-trip logic. */
  tripDays?: number;
}

export interface Constraints {
  mustBeAwake?: Array<{
    start: string;
    end: string;
    tz: string;
    label: string;
  }>;
  noWorkoutWindows?: Array<{ start: string; end: string; tz: string }>;
}

export interface PlanInput {
  traveler: Traveler;
  itinerary: Itinerary;
  constraints?: Constraints;
  /** ISO instant; the injected clock. */
  now: string;
}

export type Direction = "advance" | "delay";

export interface EngineOptions {
  /** User override of the direction choice (§2.4). */
  forceDirection?: Direction;
  /** Melatonin window on waking when delaying (§2.5). Default false. */
  allowDelayMelatonin?: boolean;
}

export type BlockKind =
  | "SLEEP"
  | "SEEK_LIGHT"
  | "AVOID_LIGHT"
  | "MELATONIN_WINDOW"
  | "EXERCISE_GOOD"
  | "EXERCISE_AVOID"
  | "CAFFEINE_OK"
  | "CAFFEINE_STOP"
  | "MEAL"
  | "WIND_DOWN";

/** Reference ids from spec §1.1; "none" for comfort layers without a cited source. */
export type SourceRef =
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "R6"
  | "R7"
  | "R8"
  | "R9"
  | "R10"
  | "R11"
  | "R12"
  | "none";

export type EvidenceGrade = "A" | "B" | "C";

export const REASON_CODES = [
  "SLEEP_SHIFTING",
  "SLEEP_SETTLED",
  "SLEEP_HOME_TIME",
  "SLEEP_LOCAL_TIME",
  "SEEK_LIGHT_ADVANCE",
  "SEEK_LIGHT_DELAY",
  "AVOID_LIGHT_ADVANCE",
  "AVOID_LIGHT_DELAY",
  "MELATONIN_WINDOW",
  "EXERCISE_GOOD_ADVANCE",
  "EXERCISE_GOOD_DELAY",
  "EXERCISE_AVOID_DIRECTION",
  "EXERCISE_AVOID_BEDTIME",
  "CAFFEINE_OK",
  "CAFFEINE_STOP",
  "MEAL",
  "WIND_DOWN",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface Block {
  kind: BlockKind;
  startUtc: string;
  endUtc: string;
  /** Where the traveler is at startUtc. */
  localTz: string;
  reasonCode: ReasonCode;
  /** User-facing copy for reasonCode, from copy.ts. */
  reason: string;
  source: SourceRef;
  confidence: EvidenceGrade;
  movable: boolean;
}

export const WARNING_CODES = [
  "PHASE_ESTIMATE_UNCERTAIN",
  "LIGHT_BLOCK_SHIFTED",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export interface PlanWarning {
  code: WarningCode;
  message: string;
  dayIndex?: number;
}

export interface PlanDay {
  /** Destination-local date (YYYY-MM-DD) of this day's wake time. */
  date: string;
  localTzAtWake: string;
  /** Estimated CBTmin during this day's main sleep. */
  cbtMinUtc: string;
  blocks: Block[];
  /** |CBTmin - target| in destination wall time, hours, before this day's shift. */
  misalignmentBefore: number;
  /** Same, after this day's shift. */
  misalignmentAfter: number;
  effectiveShiftHours: number;
  flags: string[];
}

export type DecisionDirection = Direction | "none" | "short-trip";

export interface Decision {
  direction: DecisionDirection;
  /** Signed, (-12, +12]; positive = the clock must move earlier. */
  deltaHours: number;
  daysAdvance: number;
  daysDelay: number;
  chosenDays: number;
  /** Target CBTmin as destination wall-clock time, "HH:MM". */
  targetCbtMinLocal: string;
  explanation: string;
}

export interface PlanResult {
  decision: Decision;
  days: PlanDay[];
  staticAdvice: Array<{ dayIndex: number; text: string; source: string }>;
  warnings: PlanWarning[];
  droppedBlocks: Array<{ dayIndex: number; kind: string; reason: string }>;
  engineVersion: string;
}
