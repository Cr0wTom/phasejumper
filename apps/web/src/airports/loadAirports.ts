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

import type { Airport } from "@phasejumper/airports";
import {
  indexAirports,
  type AirportRecord,
  type SearchableAirport,
} from "./searchAirports";

export interface AirportDirectory {
  airports: readonly SearchableAirport[];
  lookup: (iata: string) => Airport | undefined;
}

let directoryPromise: Promise<AirportDirectory> | null = null;

function isAirport(value: unknown): value is AirportRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.iata === "string" &&
    typeof record.icao === "string" &&
    typeof record.name === "string" &&
    typeof record.city === "string" &&
    typeof record.country === "string" &&
    typeof record.lat === "number" &&
    typeof record.lon === "number" &&
    typeof record.tz === "string"
  );
}

function readAirports(table: unknown): AirportRecord[] {
  if (typeof table !== "object" || table === null) {
    throw new Error("Airport data is not an object.");
  }
  const airports: AirportRecord[] = [];
  for (const value of Object.values(table)) {
    if (!isAirport(value)) {
      throw new Error("Airport data has a record with an unexpected shape.");
    }
    airports.push(value);
  }
  return airports;
}

async function load(): Promise<AirportDirectory> {
  // Both imports are dynamic so the dataset stays out of the initial chunk.
  const [tableMod, api] = await Promise.all([
    import("@phasejumper/airports/airports.json"),
    import("@phasejumper/airports"),
  ]);
  const airports = indexAirports(readAirports(tableMod.default));
  return { airports, lookup: api.lookup };
}

export function loadAirportDirectory(): Promise<AirportDirectory> {
  if (directoryPromise === null) {
    directoryPromise = load().catch((error: unknown) => {
      directoryPromise = null;
      throw error;
    });
  }
  return directoryPromise;
}
