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

import { lookup } from "@phasejumper/airports";
import { generatePlan, validatePlanInput } from "@phasejumper/engine";
import { describe, expect, it } from "vitest";
import { messages } from "../src/messages";
import { melatoninTimingVisible } from "../src/routes/trip/formState";
import { mapTripForm } from "../src/routes/trip/mapPlanInput";
import type { TripFormValues } from "../src/routes/trip/schema";

const NOW = "2027-01-11T12:00:00Z";

function form(overrides: Partial<TripFormValues> = {}): TripFormValues {
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
    preAdjustDays: 0,
    arrivalStyle: "body-clock",
    legs: [
      {
        id: "leg-1",
        fromQuery: "PRG, Prague",
        fromIata: "PRG",
        toQuery: "JFK, New York",
        toIata: "JFK",
        departureDate: "2027-01-18",
        departureTime: "10:00",
        arrivalDate: "2027-01-18",
        arrivalTime: "13:00",
        flightNumber: "",
      },
    ],
    mustBeAwake: [],
    noWorkoutWindows: [],
    returnLegs: [],
    tripDays: "",
    ...overrides,
  };
}

describe("mapTripForm", () => {
  it("maps airports, zones, and defaults into PlanInput", () => {
    const mapped = mapTripForm(
      form({
        exerciseEnabled: true,
        tripDays: "5",
        mustBeAwake: [
          {
            id: "event-1",
            label: "Client dinner",
            startDate: "2027-01-19",
            startTime: "19:00",
            endDate: "2027-01-20",
            endTime: "00:30",
            tz: "America/New_York",
          },
        ],
        legs: [
          {
            id: "leg-1",
            fromQuery: "",
            fromIata: "PRG",
            toQuery: "",
            toIata: "JFK",
            departureDate: "2027-01-18",
            departureTime: "10:00",
            arrivalDate: "2027-01-18",
            arrivalTime: "13:00",
            flightNumber: "OK123",
          },
        ],
      }),
      lookup,
      NOW,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    const prague = lookup("PRG");
    const kennedy = lookup("JFK");
    expect(prague).toBeDefined();
    expect(kennedy).toBeDefined();
    expect(mapped.input.itinerary.homeTz).toBe(prague?.tz);
    expect(mapped.input.itinerary.destinationTz).toBe(kennedy?.tz);
    expect(mapped.input.itinerary.tripDays).toBe(5);
    expect(mapped.input.itinerary.returnLegs).toBeUndefined();
    expect(mapped.input.now).toBe(NOW);
    expect(mapped.input.traveler).toMatchObject({
      habitualBedtime: "23:00",
      habitualWake: "07:00",
      chronotype: "intermediate",
      sleepNeedHours: 8,
      useMelatonin: false,
      caffeine: "normal",
      exercise: { enabled: true },
      meditation: { enabled: false },
      mealTiming: { enabled: false },
      preAdjustDays: 0,
    });
    // The default arrival style is not stored (share links stay the same).
    expect(mapped.input.traveler).not.toHaveProperty("arrivalStyle");

    const leg = mapped.input.itinerary.legs[0];
    expect(leg).toMatchObject({
      departureAirport: "PRG",
      arrivalAirport: "JFK",
      departureLocal: "2027-01-18T10:00",
      arrivalLocal: "2027-01-18T13:00",
      departureTz: prague?.tz,
      arrivalTz: kennedy?.tz,
      flightNumber: "OK123",
      departureLatLon: { lat: prague?.lat, lon: prague?.lon },
      arrivalLatLon: { lat: kennedy?.lat, lon: kennedy?.lon },
    });
    expect(mapped.input.constraints?.mustBeAwake).toEqual([
      {
        label: "Client dinner",
        start: "2027-01-19T19:00",
        end: "2027-01-20T00:30",
        tz: "America/New_York",
      },
    ]);

    const valid = validatePlanInput(mapped.input);
    expect(valid.ok).toBe(true);
    const plan = generatePlan(mapped.input);
    expect(plan.decision.explanation.length).toBeGreaterThan(0);
    expect(plan.days.length).toBeGreaterThan(0);
  });

  it("omits optional flight number, trip length, and constraints", () => {
    const mapped = mapTripForm(form(), lookup, NOW);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.itinerary.legs[0]?.flightNumber).toBeUndefined();
    expect(mapped.input.itinerary.tripDays).toBeUndefined();
    expect(mapped.input.constraints).toBeUndefined();
  });

  it("reports an unknown airport and an arrival before departure on the fields", () => {
    const unknown = mapTripForm(
      form({
        legs: [
          {
            id: "leg-1",
            fromQuery: "ZZZ",
            fromIata: "ZZZ",
            toQuery: "",
            toIata: "JFK",
            departureDate: "2027-01-18",
            departureTime: "10:00",
            arrivalDate: "2027-01-18",
            arrivalTime: "13:00",
            flightNumber: "",
          },
        ],
      }),
      lookup,
      NOW,
    );
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.fieldErrors["legs.0.fromIata"]).toBe(messages.chooseAirport);

    const order = mapTripForm(
      form({
        legs: [
          {
            id: "leg-1",
            fromQuery: "",
            fromIata: "PRG",
            toQuery: "",
            toIata: "JFK",
            departureDate: "2027-01-18",
            departureTime: "22:00",
            arrivalDate: "2027-01-18",
            arrivalTime: "10:00",
            flightNumber: "",
          },
        ],
      }),
      lookup,
      NOW,
    );
    expect(order.ok).toBe(false);
    if (order.ok) return;
    expect(order.fieldErrors["legs.0.arrivalTime"]).toBe(
      messages.arrivalBeforeDeparture,
    );
  });

  it("maps a melatonin contraindication as a single boolean", () => {
    const mapped = mapTripForm(
      form({
        useMelatonin: true,
        melatoninPregnant: true,
        melatoninMedication: false,
        melatoninUnder18: false,
      }),
      lookup,
      NOW,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.traveler.useMelatonin).toBe(true);
    expect(mapped.input.traveler.melatoninContraindicated).toBe(true);
  });

  it("stores melatonin timing only when evening is chosen", () => {
    const evening = mapTripForm(
      form({ useMelatonin: true, melatoninTiming: "evening" }),
      lookup,
      NOW,
    );
    expect(evening.ok).toBe(true);
    if (!evening.ok) return;
    expect(evening.input.traveler.melatoninTiming).toBe("evening");
    const strongest = mapTripForm(
      form({ useMelatonin: true, melatoninTiming: "strongest" }),
      lookup,
      NOW,
    );
    expect(strongest.ok).toBe(true);
    if (!strongest.ok) return;
    expect(strongest.input.traveler).not.toHaveProperty("melatoninTiming");
  });

  it("hides the timing choice when melatonin is off or contraindicated", () => {
    const off = form();
    expect(melatoninTimingVisible(off)).toBe(false);
    const on = form({ useMelatonin: true });
    expect(melatoninTimingVisible(on)).toBe(true);
    expect(melatoninTimingVisible({ ...on, melatoninPregnant: true })).toBe(
      false,
    );
    expect(melatoninTimingVisible({ ...on, melatoninMedication: true })).toBe(
      false,
    );
    expect(melatoninTimingVisible({ ...on, melatoninUnder18: true })).toBe(
      false,
    );
  });

  it("stores the arrival style only when 'local' is chosen", () => {
    const mapped = mapTripForm(form({ arrivalStyle: "local" }), lookup, NOW);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.traveler.arrivalStyle).toBe("local");
  });
});
