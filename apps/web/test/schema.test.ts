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

import { describe, expect, it } from "vitest";
import { messages } from "../src/messages";
import { parseTripForm, type TripFormValues } from "../src/routes/trip/schema";

function validForm(): TripFormValues {
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
        fromQuery: "",
        fromIata: "PRG",
        toQuery: "",
        toIata: "JFK",
        departureDate: "2027-01-18",
        departureTime: "10:00",
        arrivalDate: "2027-01-18",
        arrivalTime: "13:00",
        flightNumber: "  OK123  ",
      },
    ],
    mustBeAwake: [],
    noWorkoutWindows: [],
    returnLegs: [],
    tripDays: "",
  };
}

describe("trip form schema", () => {
  it("accepts a complete form and trims the flight number", () => {
    const parsed = parseTripForm(validForm());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.legs[0]?.flightNumber).toBe("OK123");
    expect(parsed.value.habitualBedtime).toBe("23:00");
  });

  it("round-trips melatonin timing and rejects an unknown choice", () => {
    const evening = parseTripForm({
      ...validForm(),
      useMelatonin: true,
      melatoninTiming: "evening",
    });
    expect(evening.ok).toBe(true);
    if (evening.ok) expect(evening.value.melatoninTiming).toBe("evening");
    const strongest = parseTripForm({
      ...validForm(),
      melatoninTiming: "strongest",
    });
    expect(strongest.ok).toBe(true);
    if (strongest.ok) expect(strongest.value.melatoninTiming).toBe("strongest");
    const bad = parseTripForm({
      ...validForm(),
      melatoninTiming: "later" as "strongest",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fieldErrors.melatoninTiming).toBe(messages.fieldInvalid);
    }
  });

  it("reports an invalid bedtime on that field", () => {
    const parsed = parseTripForm({ ...validForm(), habitualBedtime: "25:99" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.habitualBedtime).toBe(messages.timeInvalid);
  });

  it("reports identical sleep times on the bedtime field", () => {
    const parsed = parseTripForm({
      ...validForm(),
      habitualBedtime: "07:00",
      habitualWake: "07:00",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.habitualBedtime).toBe(messages.timesSame);
  });

  it("reports a bad date on the departure date field", () => {
    const form = validForm();
    form.legs[0] = {
      ...form.legs[0],
      id: "leg-1",
      fromQuery: "",
      fromIata: "PRG",
      toQuery: "",
      toIata: "JFK",
      departureDate: "2027-02-31",
      departureTime: "10:00",
      arrivalDate: "2027-01-18",
      arrivalTime: "13:00",
      flightNumber: "",
    };
    const parsed = parseTripForm(form);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors["legs.0.departureDate"]).toBe(
      messages.dateInvalid,
    );
  });

  it("requires an airport chosen from the list", () => {
    const form = validForm();
    const leg = form.legs[0];
    if (leg === undefined) throw new Error("missing leg");
    form.legs[0] = { ...leg, fromIata: "" };
    const parsed = parseTripForm(form);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors["legs.0.fromIata"]).toBe(messages.chooseAirport);
  });

  it("allows a blank trip length and rejects zero", () => {
    expect(parseTripForm(validForm()).ok).toBe(true);
    expect(parseTripForm({ ...validForm(), tripDays: "4" }).ok).toBe(true);
    const parsed = parseTripForm({ ...validForm(), tripDays: "0" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.tripDays).toBe(messages.tripDaysInvalid);
  });
});
