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

// The Start screen's example trip: a fixed PRG → SFO itinerary (the
// prg-sfo-delay golden fixture), planned on the device like any other.

import type { PlanInput } from "@phasejumper/engine";

export const EXAMPLE_TRIP: PlanInput = {
  traveler: {
    habitualBedtime: "23:00",
    habitualWake: "07:00",
    chronotype: "intermediate",
    useMelatonin: false,
    caffeine: "normal",
    exercise: { enabled: true },
    meditation: { enabled: true },
    mealTiming: { enabled: false },
    preAdjustDays: 0,
  },
  itinerary: {
    homeTz: "Europe/Prague",
    legs: [
      {
        departureAirport: "PRG",
        arrivalAirport: "SFO",
        departureLocal: "2027-01-15T23:30",
        arrivalLocal: "2027-01-16T03:05",
        departureTz: "Europe/Prague",
        arrivalTz: "America/Los_Angeles",
        departureLatLon: { lat: 50.100874, lon: 14.259911 },
        arrivalLatLon: { lat: 37.619806, lon: -122.374821 },
      },
    ],
    destinationTz: "America/Los_Angeles",
  },
  now: "2027-01-08T12:00:00Z",
};
