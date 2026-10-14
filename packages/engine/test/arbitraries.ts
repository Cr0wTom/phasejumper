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

// Random trips for property tests: zones with odd offsets and DST, any
// sleep habits, any flight length, optional events and no-workout windows.

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import type { LatLon, PlanInput } from "../src/types";

const ZONES = [
  "Europe/Prague",
  "Europe/London",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/St_Johns",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Africa/Johannesburg",
  "America/Sao_Paulo",
] as const;

/** A representative airport per zone, for daylight. */
const COORDS: Record<(typeof ZONES)[number], LatLon> = {
  "Europe/Prague": { lat: 50.1, lon: 14.26 },
  "Europe/London": { lat: 51.47, lon: -0.45 },
  "America/Los_Angeles": { lat: 37.62, lon: -122.37 },
  "America/New_York": { lat: 40.64, lon: -73.78 },
  "America/Phoenix": { lat: 33.43, lon: -112.01 },
  "America/St_Johns": { lat: 47.62, lon: -52.75 },
  "Asia/Tokyo": { lat: 35.55, lon: 139.78 },
  "Asia/Kolkata": { lat: 28.56, lon: 77.1 },
  "Asia/Kathmandu": { lat: 27.7, lon: 85.36 },
  "Asia/Dubai": { lat: 25.25, lon: 55.36 },
  "Australia/Sydney": { lat: -33.95, lon: 151.18 },
  "Australia/Adelaide": { lat: -34.95, lon: 138.53 },
  "Pacific/Auckland": { lat: -37.01, lon: 174.79 },
  "Pacific/Honolulu": { lat: 21.32, lon: -157.92 },
  "Africa/Johannesburg": { lat: -26.14, lon: 28.25 },
  "America/Sao_Paulo": { lat: -23.43, lon: -46.47 },
};

const clock = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.constantFrom(0, 15, 30, 45))
  .map(
    ([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );

export const inputs: fc.Arbitrary<PlanInput> = fc
  .record({
    bed: clock,
    sleepHours: fc.integer({ min: 5, max: 11 }),
    chronotype: fc.constantFrom("morning", "intermediate", "evening"),
    sleepNeedHours: fc.option(fc.integer({ min: 6, max: 10 }), {
      nil: undefined,
    }),
    useMelatonin: fc.boolean(),
    melatoninContraindicated: fc.boolean(),
    caffeine: fc.constantFrom("none", "normal", "heavy"),
    exercise: fc.boolean(),
    meditation: fc.boolean(),
    meals: fc.boolean(),
    preAdjustDays: fc.constantFrom(0, 1, 2, 3),
    arrivalStyle: fc.constantFrom(undefined, "local" as const),
    // Up to two reported sleeps, a few nights around departure.
    reports: fc.array(
      fc.tuple(
        fc.integer({ min: -2 * 1440, max: 8 * 1440 }),
        fc.integer({ min: 60, max: 12 * 60 }),
      ),
      { maxLength: 2 },
    ),
    home: fc.constantFrom(...ZONES),
    destination: fc.constantFrom(...ZONES),
    // 2026-01-01 .. 2028-12-31, minute resolution.
    departureEpochMinutes: fc.integer({
      min: 29_454_720,
      max: 31_032_000,
    }),
    flightMinutes: fc.integer({ min: 60, max: 1200 }),
    tripDays: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
    coordinates: fc.boolean(),
    // Minutes from departure; one optional event and no-workout window.
    event: fc.option(
      fc.tuple(
        fc.integer({ min: -3 * 1440, max: 10 * 1440 }),
        fc.integer({ min: 30, max: 600 }),
      ),
      { nil: undefined },
    ),
    noWorkout: fc.option(
      fc.tuple(
        fc.integer({ min: -3 * 1440, max: 10 * 1440 }),
        fc.integer({ min: 30, max: 600 }),
      ),
      { nil: undefined },
    ),
    // After every other field so the existing seeds keep the same trips.
    melatoninTiming: fc.constantFrom(
      undefined,
      "strongest" as const,
      "evening" as const,
    ),
  })
  .map((r) => {
    const bedMinutes =
      Number(r.bed.slice(0, 2)) * 60 + Number(r.bed.slice(3, 5));
    const wakeMinutes = (bedMinutes + r.sleepHours * 60) % 1440;
    const wake = `${String(Math.floor(wakeMinutes / 60)).padStart(2, "0")}:${String(wakeMinutes % 60).padStart(2, "0")}`;
    const dep = Temporal.Instant.fromEpochMilliseconds(
      r.departureEpochMinutes * 60_000,
    );
    const arr = dep.add({ minutes: r.flightMinutes });
    const window = ([offset, length]: [number, number]) => ({
      start: dep
        .add({ minutes: offset })
        .toZonedDateTimeISO(r.destination)
        .toPlainDateTime()
        .toString(),
      end: dep
        .add({ minutes: offset + length })
        .toZonedDateTimeISO(r.destination)
        .toPlainDateTime()
        .toString(),
      tz: r.destination,
    });
    return {
      traveler: {
        habitualBedtime: r.bed,
        habitualWake: wake,
        chronotype: r.chronotype,
        ...(r.sleepNeedHours === undefined
          ? {}
          : { sleepNeedHours: r.sleepNeedHours }),
        useMelatonin: r.useMelatonin,
        melatoninContraindicated: r.melatoninContraindicated,
        ...(r.melatoninTiming === undefined
          ? {}
          : { melatoninTiming: r.melatoninTiming }),
        caffeine: r.caffeine,
        exercise: { enabled: r.exercise },
        meditation: { enabled: r.meditation },
        mealTiming: { enabled: r.meals },
        preAdjustDays: r.preAdjustDays,
        ...(r.arrivalStyle === undefined
          ? {}
          : { arrivalStyle: r.arrivalStyle }),
      },
      itinerary: {
        homeTz: r.home,
        destinationTz: r.destination,
        legs: [
          {
            departureAirport: "AAA",
            arrivalAirport: "BBB",
            departureLocal: dep
              .toZonedDateTimeISO(r.home)
              .toPlainDateTime()
              .toString(),
            arrivalLocal: arr
              .toZonedDateTimeISO(r.destination)
              .toPlainDateTime()
              .toString(),
            departureTz: r.home,
            arrivalTz: r.destination,
            ...(r.coordinates
              ? {
                  departureLatLon: COORDS[r.home],
                  arrivalLatLon: COORDS[r.destination],
                }
              : {}),
          },
        ],
        ...(r.tripDays === undefined ? {} : { tripDays: r.tripDays }),
      },
      constraints: {
        ...(r.event === undefined
          ? {}
          : { mustBeAwake: [{ ...window(r.event), label: "Event" }] }),
        ...(r.noWorkout === undefined
          ? {}
          : { noWorkoutWindows: [window(r.noWorkout)] }),
      },
      now: "2026-01-01T00:00:00Z",
      ...(r.reports.length === 0
        ? {}
        : {
            observedSleep: r.reports.map(([offset, minutes]) => ({
              start: dep.add({ minutes: offset }).toString(),
              end: dep.add({ minutes: offset + minutes }).toString(),
            })),
          }),
    } satisfies PlanInput;
  });

/**
 * Trips of 2–3 flights: connections from 45 min to 30 h (an overnight
 * layover or a short stop), any departure time, ending at the destination.
 */
export const multiLegInputs: fc.Arbitrary<PlanInput> = fc
  .tuple(
    inputs,
    fc.array(
      fc.record({
        zone: fc.constantFrom(...ZONES),
        flyMinutes: fc.integer({ min: 45, max: 900 }),
        layoverMinutes: fc.integer({ min: 45, max: 1800 }),
      }),
      { minLength: 1, maxLength: 2 },
    ),
    fc.integer({ min: 45, max: 900 }),
  )
  .map(([base, hops, lastFlyMinutes]) => {
    const first = base.itinerary.legs[0];
    if (first === undefined) return base;
    const home = base.itinerary.homeTz;
    const destination = base.itinerary.destinationTz;
    const local = (at: Temporal.Instant, zone: string): string =>
      at.toZonedDateTimeISO(zone).toPlainDateTime().toString();
    let at = Temporal.PlainDateTime.from(first.departureLocal)
      .toZonedDateTime(home)
      .toInstant();
    let from = home;
    const stops = [
      ...hops.map((h) => ({ ...h })),
      { zone: destination, flyMinutes: lastFlyMinutes, layoverMinutes: 0 },
    ];
    const legs = stops.map((stop, i) => {
      const arrive = at.add({ minutes: stop.flyMinutes });
      const leg = {
        departureAirport: `A${i}A`,
        arrivalAirport: `B${i}B`,
        departureLocal: local(at, from),
        arrivalLocal: local(arrive, stop.zone),
        departureTz: from,
        arrivalTz: stop.zone,
      };
      at = arrive.add({ minutes: stop.layoverMinutes });
      from = stop.zone;
      return leg;
    });
    return { ...base, itinerary: { ...base.itinerary, legs } };
  });
