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
import { describe, expect, it } from "vitest";
import {
  buildTechnicalReport,
  hashedInputDigest,
} from "../src/technicalReport";

const input = {
  traveler: {
    habitualBedtime: "23:00",
    habitualWake: "07:00",
    chronotype: "intermediate",
    useMelatonin: false,
    caffeine: "normal",
    exercise: { enabled: false },
    meditation: { enabled: false },
    mealTiming: { enabled: false },
    preAdjustDays: 0,
  },
  itinerary: {
    homeTz: "Europe/Prague",
    legs: [
      {
        departureAirport: "PRG",
        arrivalAirport: "JFK",
        departureLocal: "2027-01-18T10:00",
        arrivalLocal: "2027-01-18T13:00",
        departureTz: "Europe/Prague",
        arrivalTz: "America/New_York",
      },
    ],
    destinationTz: "America/New_York",
  },
  now: "2027-01-11T12:00:00Z",
} as PlanInput;

describe("technical report", () => {
  it("hashes JSON.stringify(input) and omits the trip", async () => {
    const digest = await hashedInputDigest(input);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(await hashedInputDigest(input));
    const report = await buildTechnicalReport({
      engineVersion: "0.2.0",
      appVersion: "0.0.0",
      userAgent: "test",
      input,
      warnings: ["WEAK_DAY"],
    });
    expect(Object.keys(report).sort()).toEqual(
      [
        "appVersion",
        "engineVersion",
        "flags",
        "hashedInputDigest",
        "userAgent",
        "warnings",
      ].sort(),
    );
    expect(report.hashedInputDigest).toBe(digest);
    expect(report.warnings).toEqual(["WEAK_DAY"]);
    expect(JSON.stringify(report)).not.toMatch(/\bPRG\b/);
    expect(JSON.stringify(report)).not.toMatch(/\bJFK\b/);
  });

  it("uses a null digest when there is no last plan", async () => {
    const report = await buildTechnicalReport({
      engineVersion: "0.2.0",
      appVersion: "0.0.0",
      userAgent: "test",
      input: undefined,
      warnings: [],
    });
    expect(report.hashedInputDigest).toBeNull();
    expect(report.warnings).toEqual([]);
  });
});
