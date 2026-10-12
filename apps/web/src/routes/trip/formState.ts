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

import type { AwakeForm, LegForm, TripFormValues, WindowForm } from "./schema";

export function createId(): string {
  return crypto.randomUUID();
}

export function emptyLeg(): LegForm {
  return {
    id: createId(),
    fromQuery: "",
    fromIata: "",
    toQuery: "",
    toIata: "",
    departureDate: "",
    departureTime: "",
    arrivalDate: "",
    arrivalTime: "",
    flightNumber: "",
  };
}

export function emptyAwake(): AwakeForm {
  return {
    id: createId(),
    label: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    tz: "",
  };
}

export function emptyWindow(): WindowForm {
  return {
    id: createId(),
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    tz: "",
  };
}

export function createDefaultForm(): TripFormValues {
  return {
    habitualBedtime: "23:00",
    habitualWake: "07:00",
    chronotype: "intermediate",
    sleepNeedHours: "8",
    useMelatonin: false,
    caffeine: "normal",
    exerciseEnabled: false,
    meditationEnabled: false,
    mealTimingEnabled: false,
    preAdjustDays: 0,
    legs: [emptyLeg()],
    mustBeAwake: [],
    noWorkoutWindows: [],
    tripDays: "",
  };
}

export function isChronotype(
  value: string,
): value is TripFormValues["chronotype"] {
  return value === "morning" || value === "intermediate" || value === "evening";
}

export function isCaffeine(value: string): value is TripFormValues["caffeine"] {
  return value === "none" || value === "normal" || value === "heavy";
}

export function isPreAdjust(value: string): value is "0" | "1" | "2" | "3" {
  return value === "0" || value === "1" || value === "2" || value === "3";
}
