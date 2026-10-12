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

import type {
  Constraints,
  FlightLeg,
  LatLon,
  PlanInput,
  Traveler,
} from "../src/types";

export const traveler: Traveler = {
  habitualBedtime: "23:00",
  habitualWake: "07:00",
  chronotype: "intermediate",
  useMelatonin: false,
  caffeine: "normal",
  exercise: { enabled: true },
  meditation: { enabled: true },
  mealTiming: { enabled: true },
  preAdjustDays: 0,
};

/** Airport coordinates used by tests (from airports.json). */
export const AIRPORTS: Record<string, LatLon> = {
  PRG: { lat: 50.100874, lon: 14.259911 },
  SFO: { lat: 37.619806, lon: -122.374821 },
  HND: { lat: 35.552258, lon: 139.779694 },
  HEL: { lat: 60.3172, lon: 24.9633 },
  DXB: { lat: 25.252778, lon: 55.364444 },
  SYD: { lat: -33.946098, lon: 151.177002 },
};

export function leg(
  from: string,
  to: string,
  departureLocal: string,
  arrivalLocal: string,
  departureTz: string,
  arrivalTz: string,
  withCoordinates = false,
): FlightLeg {
  const dep = AIRPORTS[from];
  const arr = AIRPORTS[to];
  return {
    departureAirport: from,
    arrivalAirport: to,
    departureLocal,
    arrivalLocal,
    departureTz,
    arrivalTz,
    ...(withCoordinates && dep !== undefined ? { departureLatLon: dep } : {}),
    ...(withCoordinates && arr !== undefined ? { arrivalLatLon: arr } : {}),
  };
}

export function trip(
  legs: FlightLeg[],
  destinationTz: string,
  overrides: {
    traveler?: Partial<Traveler>;
    tripDays?: number;
    homeTz?: string;
    constraints?: Constraints;
  } = {},
): PlanInput {
  return {
    traveler: { ...traveler, ...overrides.traveler },
    itinerary: {
      homeTz: overrides.homeTz ?? "Europe/Prague",
      legs,
      destinationTz,
      ...(overrides.tripDays === undefined
        ? {}
        : { tripDays: overrides.tripDays }),
    },
    ...(overrides.constraints === undefined
      ? {}
      : { constraints: overrides.constraints }),
    now: "2027-01-01T00:00:00Z",
  };
}

/** January: Prague UTC+1, San Francisco UTC−8 → −9 h. */
export const prgSfo = (o?: Parameters<typeof trip>[2]): PlanInput =>
  trip(
    [
      leg(
        "PRG",
        "SFO",
        "2027-01-15T10:30",
        "2027-01-15T13:05",
        "Europe/Prague",
        "America/Los_Angeles",
      ),
    ],
    "America/Los_Angeles",
    o,
  );

/** January: Prague UTC+1, Tokyo UTC+9 → +8 h. */
export const prgTyo = (o?: Parameters<typeof trip>[2]): PlanInput =>
  trip(
    [
      leg(
        "PRG",
        "HND",
        "2027-01-15T12:00",
        "2027-01-16T08:00",
        "Europe/Prague",
        "Asia/Tokyo",
      ),
    ],
    "Asia/Tokyo",
    o,
  );

/** October: Prague UTC+2 (CEST), Sydney UTC+11 (AEDT) → +9 h. Via DXB. */
export const prgSyd = (o?: Parameters<typeof trip>[2]): PlanInput =>
  trip(
    [
      leg(
        "PRG",
        "DXB",
        "2026-10-10T14:00",
        "2026-10-10T22:30",
        "Europe/Prague",
        "Asia/Dubai",
      ),
      leg(
        "DXB",
        "SYD",
        "2026-10-11T02:30",
        "2026-10-11T22:00",
        "Asia/Dubai",
        "Australia/Sydney",
      ),
    ],
    "Australia/Sydney",
    o,
  );

/** January: Prague UTC+1, London UTC+0 → −1 h. */
export const prgLhr = (o?: Parameters<typeof trip>[2]): PlanInput =>
  trip(
    [
      leg(
        "PRG",
        "LHR",
        "2027-01-15T09:00",
        "2027-01-15T10:00",
        "Europe/Prague",
        "Europe/London",
      ),
    ],
    "Europe/London",
    o,
  );
