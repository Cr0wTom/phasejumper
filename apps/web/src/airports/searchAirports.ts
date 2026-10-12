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

export interface AirportRecord {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface SearchableAirport extends AirportRecord {
  iataLower: string;
  cityLower: string;
  nameLower: string;
}

export interface AirportSearch {
  results: readonly SearchableAirport[];
  total: number;
}

/** The listbox shows this many matches. The scan still covers every airport. */
export const AIRPORT_RESULT_LIMIT = 12;

export function indexAirports(
  airports: readonly AirportRecord[],
): SearchableAirport[] {
  return airports.map((airport) => ({
    ...airport,
    iataLower: airport.iata.toLowerCase(),
    cityLower: airport.city.toLowerCase(),
    nameLower: airport.name.toLowerCase(),
  }));
}

export function airportLabel(
  airport: Pick<AirportRecord, "iata" | "city" | "name">,
): string {
  return `${airport.iata}, ${airport.city}, ${airport.name}`;
}

function rankAirport(airport: SearchableAirport, query: string): number | null {
  if (airport.iataLower === query) return 0;
  if (airport.iataLower.startsWith(query)) return 1;
  if (airport.cityLower.startsWith(query)) return 2;
  if (airport.nameLower.startsWith(query)) return 3;
  if (airport.iataLower.includes(query)) return 4;
  if (airport.cityLower.includes(query)) return 5;
  if (airport.nameLower.includes(query)) return 6;
  return null;
}

function byIata(a: SearchableAirport, b: SearchableAirport): number {
  if (a.iata < b.iata) return -1;
  if (a.iata > b.iata) return 1;
  return 0;
}

/** Synchronous scan of the full dataset. Callers index once, then search per keystroke. */
export function searchAirports(
  airports: readonly SearchableAirport[],
  rawQuery: string,
): AirportSearch {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return { results: [], total: 0 };

  const buckets: SearchableAirport[][] = [[], [], [], [], [], [], []];
  let total = 0;
  for (const airport of airports) {
    const rank = rankAirport(airport, query);
    if (rank === null) continue;
    total += 1;
    const bucket = buckets[rank];
    if (bucket !== undefined) bucket.push(airport);
  }

  const results: SearchableAirport[] = [];
  for (const bucket of buckets) {
    bucket.sort(byIata);
    for (const airport of bucket) {
      results.push(airport);
      if (results.length === AIRPORT_RESULT_LIMIT) return { results, total };
    }
  }
  return { results, total };
}
