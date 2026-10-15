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

import type { PlanInput } from "@phasejumper/engine";
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
    melatoninTiming: "strongest",
    melatoninPregnant: false,
    melatoninMedication: false,
    melatoninUnder18: false,
    caffeine: "normal",
    exerciseEnabled: false,
    meditationEnabled: false,
    mealTimingEnabled: false,
    // Arrive as ready as possible: the plan uses only the days it needs.
    preAdjustDays: 3,
    arrivalStyle: "body-clock",
    legs: [emptyLeg()],
    returnLegs: [],
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

/** The timing choice is shown only after opting in, with no contraindication ticked. */
export function melatoninTimingVisible(form: {
  useMelatonin: boolean;
  melatoninPregnant: boolean;
  melatoninMedication: boolean;
  melatoninUnder18: boolean;
}): boolean {
  return (
    form.useMelatonin &&
    !form.melatoninPregnant &&
    !form.melatoninMedication &&
    !form.melatoninUnder18
  );
}

export function isPreAdjust(value: string): value is "0" | "1" | "2" | "3" {
  return value === "0" || value === "1" || value === "2" || value === "3";
}

/** The inverse of mapTripForm: a saved plan's input back into the form ("Edit trip"). */
export function formFromPlanInput(
  input: PlanInput,
  airportLabel: (iata: string) => string,
): TripFormValues {
  const t = input.traveler;
  const date = (local: string): string => local.slice(0, 10);
  const time = (local: string): string => local.slice(11, 16);
  const toLeg = (leg: (typeof input.itinerary.legs)[number]): LegForm => ({
    id: createId(),
    fromQuery: airportLabel(leg.departureAirport),
    fromIata: leg.departureAirport,
    toQuery: airportLabel(leg.arrivalAirport),
    toIata: leg.arrivalAirport,
    departureDate: date(leg.departureLocal),
    departureTime: time(leg.departureLocal),
    arrivalDate: date(leg.arrivalLocal),
    arrivalTime: time(leg.arrivalLocal),
    flightNumber: leg.flightNumber ?? "",
  });
  // Days at the destination are derived from the flights while a return exists.
  const returnLegs = (input.itinerary.returnLegs ?? []).map(toLeg);
  return {
    habitualBedtime: t.habitualBedtime,
    habitualWake: t.habitualWake,
    chronotype: t.chronotype,
    sleepNeedHours: String(t.sleepNeedHours ?? 8),
    useMelatonin: t.useMelatonin,
    melatoninTiming: t.melatoninTiming === "evening" ? "evening" : "strongest",
    melatoninPregnant: false,
    melatoninMedication: t.melatoninContraindicated === true,
    melatoninUnder18: false,
    caffeine: t.caffeine,
    exerciseEnabled: t.exercise.enabled,
    meditationEnabled: t.meditation.enabled,
    mealTimingEnabled: t.mealTiming.enabled,
    preAdjustDays: t.preAdjustDays,
    arrivalStyle: t.arrivalStyle ?? "body-clock",
    legs: input.itinerary.legs.map(toLeg),
    returnLegs,
    mustBeAwake: (input.constraints?.mustBeAwake ?? []).map((event) => ({
      id: createId(),
      label: event.label,
      startDate: date(event.start),
      startTime: time(event.start),
      endDate: date(event.end),
      endTime: time(event.end),
      tz: event.tz,
    })),
    noWorkoutWindows: (input.constraints?.noWorkoutWindows ?? []).map(
      (window) => ({
        id: createId(),
        startDate: date(window.start),
        startTime: time(window.start),
        endDate: date(window.end),
        endTime: time(window.end),
        tz: window.tz,
      }),
    ),
    tripDays:
      returnLegs.length > 0 || input.itinerary.tripDays === undefined
        ? ""
        : String(input.itinerary.tripDays),
  };
}
