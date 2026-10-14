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
import { sunAltitudeAt, type PlanInput } from "../src";
import input from "./fixtures/prg-tyo-advance.input.json";

const plan = input as PlanInput;

describe("sunAltitudeAt", () => {
  it("is the sun's altitude in degrees where the traveler is", () => {
    // Prague, 13 Jan 2027 at local noon: low winter sun.
    const noon = sunAltitudeAt(plan, "2027-01-13T11:00:00Z");
    expect(noon).toBeGreaterThan(10);
    expect(noon).toBeLessThan(25);
    // Prague at 03:00 local: night.
    expect(sunAltitudeAt(plan, "2027-01-13T02:00:00Z")).toBeLessThan(-18);
  });

  it("follows the traveler to the destination", () => {
    // Tokyo, 17 Jan 2027 at 12:00 local (03:00 UTC): sun up.
    expect(sunAltitudeAt(plan, "2027-01-17T03:00:00Z")).toBeGreaterThan(20);
  });

  it("is undefined in the air", () => {
    // PRG 12:00 (11:00 UTC) on 15 Jan to HND 08:00 (23:00 UTC) on 16 Jan.
    expect(sunAltitudeAt(plan, "2027-01-15T18:00:00Z")).toBeUndefined();
  });
});
