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
import raw from "../../../packages/airports/src/airports.json";
import {
  AIRPORT_RESULT_LIMIT,
  indexAirports,
  searchAirports,
  type AirportRecord,
} from "../src/airports/searchAirports";

const airports = indexAirports(Object.values(raw) as AirportRecord[]);

describe("searchAirports", () => {
  it("matches IATA code, city, and airport name", () => {
    expect(searchAirports(airports, "PRG").results[0]?.iata).toBe("PRG");
    expect(
      searchAirports(airports, "prague").results.some(
        (airport) => airport.iata === "PRG",
      ),
    ).toBe(true);
    expect(
      searchAirports(airports, "kennedy").results.some(
        (airport) => airport.iata === "JFK",
      ),
    ).toBe(true);
    expect(searchAirports(airports, "   ").results).toEqual([]);
  });

  it("searches the full dataset in 50 ms or less per keystroke", () => {
    expect(airports.length).toBeGreaterThan(4000);
    for (const query of ["a", "e", "prg", "new york", "kennedy", "zzzzqqq"]) {
      const start = performance.now();
      const found = searchAirports(airports, query);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(50);
      expect(found.results.length).toBeLessThanOrEqual(AIRPORT_RESULT_LIMIT);
    }
    const broad = searchAirports(airports, "a");
    expect(broad.total).toBeGreaterThan(AIRPORT_RESULT_LIMIT);
    expect(broad.results).toHaveLength(AIRPORT_RESULT_LIMIT);
  });
});
