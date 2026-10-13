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
import { emptyLeg } from "../src/routes/trip/formState";
import { withFollowedArrival } from "../src/routes/trip/TripBuilder";

describe("the arrival date follows the departure date", () => {
  it("fills an empty arrival date", () => {
    const leg = emptyLeg();
    expect(
      withFollowedArrival(leg, { departureDate: "2027-01-15" }).arrivalDate,
    ).toBe("2027-01-15");
  });

  it("keeps following while the two dates are equal", () => {
    const leg = {
      ...emptyLeg(),
      departureDate: "2027-01-15",
      arrivalDate: "2027-01-15",
    };
    expect(
      withFollowedArrival(leg, { departureDate: "2027-01-20" }).arrivalDate,
    ).toBe("2027-01-20");
  });

  it("leaves an arrival date the traveler changed (an overnight flight)", () => {
    const leg = {
      ...emptyLeg(),
      departureDate: "2027-01-15",
      arrivalDate: "2027-01-16",
    };
    expect(
      withFollowedArrival(leg, { departureDate: "2027-01-20" }).arrivalDate,
    ).toBe("2027-01-16");
  });

  it("does not touch other edits", () => {
    const leg = {
      ...emptyLeg(),
      departureDate: "2027-01-15",
      arrivalDate: "2027-01-15",
    };
    expect(
      withFollowedArrival(leg, { arrivalDate: "2027-01-16" }).arrivalDate,
    ).toBe("2027-01-16");
    expect(withFollowedArrival(leg, { flightNumber: "OK1" }).arrivalDate).toBe(
      "2027-01-15",
    );
  });
});
