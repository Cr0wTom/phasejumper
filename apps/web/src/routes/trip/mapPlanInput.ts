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
import { messages, returnMessages } from "../../messages";
import { returnDepartsBeforeArrival, stayDays } from "./returnTrip";
import type { FieldErrors, LegForm, TripFormValues } from "./schema";

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

function mapLegs(
  formLegs: readonly LegForm[],
  lookup: (iata: string) => Airport | undefined,
  errors: Record<string, string>,
  prefix: "legs" | "returnLegs",
): FlightLeg[] {
  const built: FlightLeg[] = [];
  let previousArrival: Temporal.Instant | undefined;

  formLegs.forEach((leg, index) => {
    const departure = lookup(leg.fromIata);
    const arrival = lookup(leg.toIata);
    if (departure === undefined) {
      put(errors, `${prefix}.${index}.fromIata`, messages.chooseAirport);
    }
    if (arrival === undefined) {
      put(errors, `${prefix}.${index}.toIata`, messages.chooseAirport);
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
      put(errors, `${prefix}.${index}.departureTime`, messages.timeInvalid);
    }
    if (arrInstant === undefined) {
      put(errors, `${prefix}.${index}.arrivalTime`, messages.timeInvalid);
    }
    if (depInstant === undefined || arrInstant === undefined) return;
    if (Temporal.Instant.compare(arrInstant, depInstant) <= 0) {
      put(
        errors,
        `${prefix}.${index}.arrivalTime`,
        messages.arrivalBeforeDeparture,
      );
    } else if (
      previousArrival !== undefined &&
      Temporal.Instant.compare(depInstant, previousArrival) < 0
    ) {
      put(errors, `${prefix}.${index}.departureTime`, messages.legOutOfOrder);
    }
    previousArrival = arrInstant;

    const flight: FlightLeg = {
      departureAirport: departure.iata,
      arrivalAirport: arrival.iata,
      departureLocal: `${leg.departureDate}T${leg.departureTime}`,
      arrivalLocal: `${leg.arrivalDate}T${leg.arrivalTime}`,
      departureTz: departure.tz,
      arrivalTz: arrival.tz,
      departureLatLon: { lat: departure.lat, lon: departure.lon },
      arrivalLatLon: { lat: arrival.lat, lon: arrival.lon },
    };
    if (leg.flightNumber.length > 0) flight.flightNumber = leg.flightNumber;
    built.push(flight);
  });

  return built;
}

/**
 * The return journey, planned from the destination as home. The traveler has
 * adapted, so their usual sleep times apply there. No trip length: the stay
 * was already decided on the outbound plan.
 */
export function returnPlanInput(outbound: PlanInput): PlanInput | undefined {
  const legs = outbound.itinerary.returnLegs;
  if (legs === undefined || legs.length === 0) return undefined;
  return {
    traveler: outbound.traveler,
    itinerary: {
      homeTz: outbound.itinerary.destinationTz,
      legs,
      destinationTz: outbound.itinerary.homeTz,
    },
    ...(outbound.constraints === undefined
      ? {}
      : { constraints: outbound.constraints }),
    now: outbound.now,
  };
}

export function mapTripForm(
  form: TripFormValues,
  lookup: (iata: string) => Airport | undefined,
  now: string,
): { ok: true; input: PlanInput } | { ok: false; fieldErrors: FieldErrors } {
  const errors: Record<string, string> = {};
  const legs = mapLegs(form.legs, lookup, errors, "legs");
  const mappedReturn = mapLegs(form.returnLegs, lookup, errors, "returnLegs");

  let derivedDays: number | undefined;
  if (form.returnLegs.length > 0) {
    const lastForm = form.legs[form.legs.length - 1];
    const firstReturn = form.returnLegs[0];
    if (lastForm !== undefined && firstReturn !== undefined) {
      if (returnDepartsBeforeArrival(lastForm, firstReturn, lookup)) {
        put(errors, "tripDays", returnMessages.beforeArrival);
      }
      derivedDays = stayDays(lastForm.arrivalDate, firstReturn.departureDate);
      if (derivedDays === undefined) {
        put(errors, "tripDays", messages.dateInvalid);
      }
    }
  }

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
    form.returnLegs.length > 0
      ? derivedDays
      : form.tripDays.length === 0
        ? undefined
        : Number(form.tripDays);

  const input: PlanInput = {
    traveler: {
      habitualBedtime: form.habitualBedtime,
      habitualWake: form.habitualWake,
      chronotype: form.chronotype,
      sleepNeedHours: Number(form.sleepNeedHours),
      useMelatonin: form.useMelatonin,
      ...(form.useMelatonin &&
      (form.melatoninPregnant ||
        form.melatoninMedication ||
        form.melatoninUnder18)
        ? { melatoninContraindicated: true }
        : {}),
      caffeine: form.caffeine,
      exercise: { enabled: form.exerciseEnabled },
      meditation: { enabled: form.meditationEnabled },
      mealTiming: { enabled: form.mealTimingEnabled },
      preAdjustDays: form.preAdjustDays,
      // Only stored when chosen, so default plans and share links are unchanged.
      // Absent means "strongest" in the engine.
      ...(form.melatoninTiming === "evening"
        ? { melatoninTiming: "evening" as const }
        : {}),
      ...(form.arrivalStyle === "local" ? { arrivalStyle: "local" } : {}),
    },
    itinerary: {
      homeTz: first.departureTz,
      legs,
      destinationTz: last.arrivalTz,
      ...(tripDays === undefined ? {} : { tripDays }),
      ...(form.returnLegs.length === 0 ? {} : { returnLegs: mappedReturn }),
    },
    ...(constraints.mustBeAwake === undefined &&
    constraints.noWorkoutWindows === undefined
      ? {}
      : { constraints }),
    now,
  };

  return { ok: true, input };
}
