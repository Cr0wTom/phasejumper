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
import type { PlanInput } from "@phasejumper/engine";
import { describe, expect, it } from "vitest";
import { formFromPlanInput } from "../src/routes/trip/formState";
import { mapTripForm } from "../src/routes/trip/mapPlanInput";
import { parseTripForm } from "../src/routes/trip/schema";
import jfk from "../../../packages/engine/test/fixtures/prg-jfk-meetings.input.json";

describe("Edit trip", () => {
  it("a saved plan's input survives form → input unchanged", () => {
    const input = jfk as unknown as PlanInput;
    const form = formFromPlanInput(input, (iata) => iata);
    const parsed = parseTripForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapped = mapTripForm(parsed.value, lookup, input.now);
    expect(mapped.ok).toBe(true);
    // The form always states sleep need; the fixture relies on the default (8).
    if (mapped.ok) {
      expect(mapped.input).toEqual({
        ...input,
        traveler: { ...input.traveler, sleepNeedHours: 8 },
      });
    }
  });

  it("reloads a contraindicated plan by checking the medication box", () => {
    const input = {
      ...(jfk as unknown as PlanInput),
      traveler: {
        ...(jfk as unknown as PlanInput).traveler,
        useMelatonin: true,
        melatoninContraindicated: true,
      },
    };
    const form = formFromPlanInput(input, (iata) => iata);
    expect(form.useMelatonin).toBe(true);
    expect(form.melatoninMedication).toBe(true);
    expect(form.melatoninPregnant).toBe(false);
    expect(form.melatoninUnder18).toBe(false);
    const parsed = parseTripForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapped = mapTripForm(parsed.value, lookup, input.now);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.traveler.melatoninContraindicated).toBe(true);
  });
});
