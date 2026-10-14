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
import { messages, returnMessages } from "../src/messages";
import { formFromPlanInput } from "../src/routes/trip/formState";
import { mapTripForm, returnPlanInput } from "../src/routes/trip/mapPlanInput";
import { returnSplitIndex, stayDays } from "../src/routes/trip/returnTrip";
import {
  parseTripForm,
  type LegForm,
  type TripFormValues,
} from "../src/routes/trip/schema";
import { isStoredPlan } from "../src/storage/plans";

const NOW = "2027-01-11T12:00:00Z";

const ZONES: Record<string, string> = {
  PRG: "Europe/Prague",
  FRA: "Europe/Berlin",
  SFO: "America/Los_Angeles",
  LHR: "Europe/London",
  LGW: "Europe/London",
  JFK: "America/New_York",
};

function zoneOf(iata: string): { tz: string } | undefined {
  const tz = ZONES[iata];
  return tz === undefined ? undefined : { tz };
}

function leg(
  partial: Partial<LegForm> & Pick<LegForm, "fromIata" | "toIata">,
): LegForm {
  return {
    id: `${partial.fromIata}-${partial.toIata}`,
    fromQuery: partial.fromIata,
    toQuery: partial.toIata,
    departureDate: "2027-01-15",
    departureTime: "10:00",
    arrivalDate: "2027-01-15",
    arrivalTime: "12:00",
    flightNumber: "",
    ...partial,
  };
}

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
      leg({
        fromIata: "PRG",
        toIata: "SFO",
        departureTime: "10:30",
        arrivalTime: "13:05",
      }),
    ],
    returnLegs: [],
    mustBeAwake: [],
    noWorkoutWindows: [],
    tripDays: "",
    ...overrides,
  };
}

describe("stay days", () => {
  it("counts whole local dates, and at least one", () => {
    expect(stayDays("2027-01-15", "2027-01-23")).toBe(8);
    expect(stayDays("2027-01-15", "2027-01-17")).toBe(2);
    expect(stayDays("2027-01-15", "2027-01-15")).toBe(1);
    expect(stayDays("2027-01-15", "2027-01-14")).toBe(1);
    expect(stayDays("", "2027-01-23")).toBeUndefined();
    expect(stayDays("2027-02-31", "2027-03-02")).toBeUndefined();
  });
});

describe("round-trip detection", () => {
  it("splits after the longest stay of at least 24 h when the trip ends at the start", () => {
    const legs = [
      leg({
        fromIata: "PRG",
        toIata: "FRA",
        departureTime: "08:00",
        arrivalTime: "09:05",
      }),
      leg({
        fromIata: "FRA",
        toIata: "SFO",
        departureTime: "11:30",
        arrivalTime: "14:00",
      }),
      leg({
        fromIata: "SFO",
        toIata: "FRA",
        departureDate: "2027-01-23",
        departureTime: "15:30",
        arrivalDate: "2027-01-24",
        arrivalTime: "11:00",
      }),
      leg({
        fromIata: "FRA",
        toIata: "PRG",
        departureDate: "2027-01-24",
        departureTime: "13:30",
        arrivalDate: "2027-01-24",
        arrivalTime: "14:40",
      }),
    ];
    expect(returnSplitIndex(legs, zoneOf)).toBe(2);
  });

  it("treats the same time zone as ending where it started", () => {
    const legs = [
      leg({
        fromIata: "LHR",
        toIata: "JFK",
        departureTime: "09:00",
        arrivalTime: "12:00",
      }),
      leg({
        fromIata: "JFK",
        toIata: "LGW",
        departureDate: "2027-01-20",
        departureTime: "18:00",
        arrivalDate: "2027-01-21",
        arrivalTime: "06:00",
      }),
    ];
    expect(returnSplitIndex(legs, zoneOf)).toBe(1);
  });

  it("detects a gap of exactly 24 h", () => {
    const legs = [
      leg({
        fromIata: "PRG",
        toIata: "SFO",
        arrivalTime: "13:00",
      }),
      leg({
        fromIata: "SFO",
        toIata: "PRG",
        departureDate: "2027-01-16",
        departureTime: "13:00",
        arrivalDate: "2027-01-17",
        arrivalTime: "09:00",
      }),
    ];
    expect(returnSplitIndex(legs, zoneOf)).toBe(1);
  });

  it("does not detect a gap under 24 h", () => {
    const legs = [
      leg({
        fromIata: "PRG",
        toIata: "SFO",
        departureTime: "10:00",
        arrivalTime: "13:00",
      }),
      leg({
        fromIata: "SFO",
        toIata: "PRG",
        departureDate: "2027-01-16",
        departureTime: "12:00",
        arrivalDate: "2027-01-17",
        arrivalTime: "08:00",
      }),
    ];
    // 13:00 Los Angeles to 12:00 next day is 23 h.
    expect(returnSplitIndex(legs, zoneOf)).toBeUndefined();
  });

  it("does not detect a trip that does not end where it started", () => {
    const legs = [
      leg({
        fromIata: "PRG",
        toIata: "FRA",
        departureTime: "08:00",
        arrivalTime: "09:00",
      }),
      leg({
        fromIata: "FRA",
        toIata: "SFO",
        departureDate: "2027-01-20",
        departureTime: "11:00",
        arrivalDate: "2027-01-20",
        arrivalTime: "14:00",
      }),
    ];
    expect(returnSplitIndex(legs, zoneOf)).toBeUndefined();
  });
});

describe("round-trip mapping", () => {
  const returning = leg({
    fromIata: "SFO",
    toIata: "PRG",
    departureDate: "2027-01-23",
    departureTime: "15:00",
    arrivalDate: "2027-01-24",
    arrivalTime: "11:30",
    flightNumber: "OK456",
  });

  it("keeps return legs through form → input → form and derives the days", () => {
    const mapped = mapTripForm(
      form({ returnLegs: [returning], tripDays: "99" }),
      lookup,
      NOW,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.itinerary.tripDays).toBe(8);
    expect(mapped.input.itinerary.destinationTz).toBe("America/Los_Angeles");
    expect(mapped.input.itinerary.returnLegs).toMatchObject([
      {
        departureAirport: "SFO",
        arrivalAirport: "PRG",
        departureLocal: "2027-01-23T15:00",
        arrivalLocal: "2027-01-24T11:30",
        flightNumber: "OK456",
      },
    ]);
    expect(validatePlanInput(mapped.input).ok).toBe(true);

    const again = formFromPlanInput(mapped.input, (iata) => iata);
    expect(again.tripDays).toBe("");
    expect(again.returnLegs).toHaveLength(1);
    expect(again.returnLegs[0]).toMatchObject({
      fromIata: "SFO",
      toIata: "PRG",
      departureDate: "2027-01-23",
      departureTime: "15:00",
      arrivalDate: "2027-01-24",
      arrivalTime: "11:30",
      flightNumber: "OK456",
    });

    const parsed = parseTripForm(again);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const remapped = mapTripForm(parsed.value, lookup, NOW);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.input.itinerary.returnLegs).toEqual(
      mapped.input.itinerary.returnLegs,
    );
    expect(remapped.input.itinerary.tripDays).toBe(8);

    const back = returnPlanInput(mapped.input);
    expect(back).toBeDefined();
    if (back === undefined) return;
    expect(back.itinerary.homeTz).toBe("America/Los_Angeles");
    expect(back.itinerary.destinationTz).toBe("Europe/Prague");
    expect(back.itinerary.tripDays).toBeUndefined();
    expect(back.itinerary.returnLegs).toBeUndefined();
    expect(back.itinerary.legs).toEqual(mapped.input.itinerary.returnLegs);
    expect(back.traveler).toEqual(mapped.input.traveler);
    expect(back.now).toBe(NOW);
    expect(validatePlanInput(back).ok).toBe(true);
    const decision = generatePlan(back).decision;
    expect(decision.direction).not.toBe("short-trip");
    expect(decision.explanation).not.toMatch(/\b0 h\b/);
  });

  it("a two-day stay is a short trip", () => {
    const mapped = mapTripForm(
      form({
        returnLegs: [
          leg({
            fromIata: "SFO",
            toIata: "PRG",
            departureDate: "2027-01-17",
            departureTime: "15:00",
            arrivalDate: "2027-01-18",
            arrivalTime: "11:30",
          }),
        ],
      }),
      lookup,
      NOW,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.itinerary.tripDays).toBe(2);
    expect(generatePlan(mapped.input).decision.direction).toBe("short-trip");
  });

  it("blocks a return that leaves before the outbound arrival", () => {
    const mapped = mapTripForm(
      form({
        returnLegs: [
          leg({
            fromIata: "SFO",
            toIata: "PRG",
            departureTime: "12:00",
            arrivalDate: "2027-01-16",
            arrivalTime: "08:00",
          }),
        ],
      }),
      lookup,
      NOW,
    );
    expect(mapped.ok).toBe(false);
    if (mapped.ok) return;
    expect(mapped.fieldErrors.tripDays).toBe(returnMessages.beforeArrival);
  });

  it("reports a return-leg error on returnLegs.<index>.<field>", () => {
    const parsed = parseTripForm(
      form({
        returnLegs: [
          leg({
            fromIata: "SFO",
            toIata: "PRG",
            departureDate: "2027-02-31",
          }),
        ],
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors["returnLegs.0.departureDate"]).toBe(
      messages.dateInvalid,
    );
  });
});

describe("isStoredPlan links", () => {
  function stored(extra: Record<string, unknown> = {}): unknown {
    return {
      id: "plan-1",
      input: { traveler: {} },
      result: { decision: { explanation: "A plan." }, days: [] },
      engineVersion: "0",
      createdAt: "2027-01-01T00:00:00Z",
      ...extra,
    };
  }

  it("accepts returnPlanId and outboundPlanId when they are strings", () => {
    const value = stored({ returnPlanId: "return-1", outboundPlanId: "out-1" });
    expect(isStoredPlan(value)).toBe(true);
    if (!isStoredPlan(value)) return;
    expect(value.returnPlanId).toBe("return-1");
    expect(value.outboundPlanId).toBe("out-1");
    expect(isStoredPlan(stored())).toBe(true);
    expect(isStoredPlan(stored({ returnPlanId: "" }))).toBe(true);
  });

  it("rejects a link that is not a string", () => {
    expect(isStoredPlan(stored({ returnPlanId: 4 }))).toBe(false);
    expect(isStoredPlan(stored({ outboundPlanId: null }))).toBe(false);
    expect(isStoredPlan(stored({ returnPlanId: { id: "x" } }))).toBe(false);
  });
});
