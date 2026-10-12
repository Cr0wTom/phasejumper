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

import type { Airport } from "@phasejumper/airports";
import type { Constraints, FlightLeg, PlanInput } from "@phasejumper/engine";
import { Temporal } from "temporal-polyfill";
import { messages } from "../../messages";
import type { FieldErrors, TripFormValues } from "./schema";

function zonedInstant(
  date: string,
  time: string,
  timeZone: string,
): Temporal.Instant | undefined {
  try {
    return Temporal.PlainDateTime.from(`${date}T${time}`)
      .toZonedDateTime(timeZone)
      .toInstant();
  } catch {
    return undefined;
  }
}

function put(
  errors: Record<string, string>,
  key: string,
  message: string,
): void {
  if (errors[key] === undefined) errors[key] = message;
}

export function zonesForLegs(
  legs: readonly { fromIata: string; toIata: string }[],
  lookup: (iata: string) => { tz: string } | undefined,
): string[] {
  const zones: string[] = [];
  for (const leg of legs) {
    for (const code of [leg.fromIata, leg.toIata]) {
      if (code.length === 0) continue;
      const zone = lookup(code)?.tz;
      if (zone !== undefined && !zones.includes(zone)) zones.push(zone);
    }
  }
  return zones;
}

export function mapTripForm(
  form: TripFormValues,
  lookup: (iata: string) => Airport | undefined,
  now: string,
): { ok: true; input: PlanInput } | { ok: false; fieldErrors: FieldErrors } {
  const errors: Record<string, string> = {};
  const legs: FlightLeg[] = [];
  let previousArrival: Temporal.Instant | undefined;

  form.legs.forEach((leg, index) => {
    const departure = lookup(leg.fromIata);
    const arrival = lookup(leg.toIata);
    if (departure === undefined) {
      put(errors, `legs.${index}.fromIata`, messages.chooseAirport);
    }
    if (arrival === undefined) {
      put(errors, `legs.${index}.toIata`, messages.chooseAirport);
    }
    if (departure === undefined || arrival === undefined) return;

    const depInstant = zonedInstant(
      leg.departureDate,
      leg.departureTime,
      departure.tz,
    );
    const arrInstant = zonedInstant(
      leg.arrivalDate,
      leg.arrivalTime,
      arrival.tz,
    );
    if (depInstant === undefined) {
      put(errors, `legs.${index}.departureTime`, messages.timeInvalid);
    }
    if (arrInstant === undefined) {
      put(errors, `legs.${index}.arrivalTime`, messages.timeInvalid);
    }
    if (depInstant === undefined || arrInstant === undefined) return;
    if (Temporal.Instant.compare(arrInstant, depInstant) <= 0) {
      put(errors, `legs.${index}.arrivalTime`, messages.arrivalBeforeDeparture);
    } else if (
      previousArrival !== undefined &&
      Temporal.Instant.compare(depInstant, previousArrival) < 0
    ) {
      put(errors, `legs.${index}.departureTime`, messages.legOutOfOrder);
    }
    previousArrival = arrInstant;

    const built: FlightLeg = {
      departureAirport: departure.iata,
      arrivalAirport: arrival.iata,
      departureLocal: `${leg.departureDate}T${leg.departureTime}`,
      arrivalLocal: `${leg.arrivalDate}T${leg.arrivalTime}`,
      departureTz: departure.tz,
      arrivalTz: arrival.tz,
      departureLatLon: { lat: departure.lat, lon: departure.lon },
      arrivalLatLon: { lat: arrival.lat, lon: arrival.lon },
    };
    if (leg.flightNumber.length > 0) built.flightNumber = leg.flightNumber;
    legs.push(built);
  });

  const allowed = new Set(zonesForLegs(form.legs, lookup));

  const mustBeAwake: NonNullable<Constraints["mustBeAwake"]> = [];
  form.mustBeAwake.forEach((event, index) => {
    if (!allowed.has(event.tz)) {
      put(errors, `mustBeAwake.${index}.tz`, messages.zoneInvalid);
      return;
    }
    const start = zonedInstant(event.startDate, event.startTime, event.tz);
    const end = zonedInstant(event.endDate, event.endTime, event.tz);
    if (
      start !== undefined &&
      end !== undefined &&
      Temporal.Instant.compare(end, start) <= 0
    ) {
      put(errors, `mustBeAwake.${index}.endTime`, messages.endsBeforeStart);
      return;
    }
    mustBeAwake.push({
      label: event.label,
      start: `${event.startDate}T${event.startTime}`,
      end: `${event.endDate}T${event.endTime}`,
      tz: event.tz,
    });
  });

  const noWorkoutWindows: NonNullable<Constraints["noWorkoutWindows"]> = [];
  form.noWorkoutWindows.forEach((window, index) => {
    if (!allowed.has(window.tz)) {
      put(errors, `noWorkoutWindows.${index}.tz`, messages.zoneInvalid);
      return;
    }
    const start = zonedInstant(window.startDate, window.startTime, window.tz);
    const end = zonedInstant(window.endDate, window.endTime, window.tz);
    if (
      start !== undefined &&
      end !== undefined &&
      Temporal.Instant.compare(end, start) <= 0
    ) {
      put(
        errors,
        `noWorkoutWindows.${index}.endTime`,
        messages.endsBeforeStart,
      );
      return;
    }
    noWorkoutWindows.push({
      start: `${window.startDate}T${window.startTime}`,
      end: `${window.endDate}T${window.endTime}`,
      tz: window.tz,
    });
  });

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first === undefined || last === undefined) {
    return { ok: false, fieldErrors: { legs: messages.legsRequired } };
  }

  const constraints: Constraints = {};
  if (mustBeAwake.length > 0) constraints.mustBeAwake = mustBeAwake;
  if (noWorkoutWindows.length > 0) {
    constraints.noWorkoutWindows = noWorkoutWindows;
  }

  const tripDays =
    form.tripDays.length === 0 ? undefined : Number(form.tripDays);

  const input: PlanInput = {
    traveler: {
      habitualBedtime: form.habitualBedtime,
      habitualWake: form.habitualWake,
      chronotype: form.chronotype,
      sleepNeedHours: Number(form.sleepNeedHours),
      useMelatonin: form.useMelatonin,
      caffeine: form.caffeine,
      exercise: { enabled: form.exerciseEnabled },
      meditation: { enabled: form.meditationEnabled },
      mealTiming: { enabled: form.mealTimingEnabled },
      preAdjustDays: form.preAdjustDays,
    },
    itinerary: {
      homeTz: first.departureTz,
      legs,
      destinationTz: last.arrivalTz,
      ...(tripDays === undefined ? {} : { tripDays }),
    },
    ...(constraints.mustBeAwake === undefined &&
    constraints.noWorkoutWindows === undefined
      ? {}
      : { constraints }),
    now,
  };

  return { ok: true, input };
}
