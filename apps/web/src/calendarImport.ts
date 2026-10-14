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

// Strict .ics import. A flight is kept only when one text field names exactly
// two known airports and the event has a start and an end no longer than a day.

import { Temporal } from "temporal-polyfill";

export interface ImportedFlight {
  fromIata: string;
  toIata: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  flightNumber?: string;
}

type AirportHit = { iata: string; tz: string };

interface RawProp {
  value: string;
  params: ReadonlyMap<string, string>;
}

interface RawEvent {
  summary?: string;
  location?: string;
  description?: string;
  dtstart?: RawProp;
  dtend?: RawProp;
}

interface WallTime {
  kind: "utc" | "zoned" | "floating";
  tz?: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface Candidate {
  flight: ImportedFlight;
  at: Temporal.Instant;
}

const DAY_NS = 24n * 60n * 60n * 1_000_000_000n;

const FLIGHT_NUMBER = /\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{1,4})\b/;

export function parseCalendarFlights(
  text: string,
  airports: {
    lookup(iata: string): { iata: string; tz: string } | undefined;
  },
):
  | { ok: true; flights: ImportedFlight[] }
  | { ok: false; reason: "not-calendar" } {
  const unfolded = unfold(text);
  if (!/BEGIN:VCALENDAR/i.test(unfolded)) {
    return { ok: false, reason: "not-calendar" };
  }
  const known = zoneCache();
  const candidates: Candidate[] = [];
  for (const event of eventsIn(unfolded)) {
    const candidate = flightFromEvent(event, airports.lookup, known);
    if (candidate !== undefined) candidates.push(candidate);
  }
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    const key = duplicateKey(candidate.flight);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  unique.sort((a, b) => Temporal.Instant.compare(a.at, b.at));
  return { ok: true, flights: unique.map((candidate) => candidate.flight) };
}

function duplicateKey(flight: ImportedFlight): string {
  return `${flight.fromIata}|${flight.toIata}|${flight.departureDate}|${flight.departureTime}`;
}

function unfold(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function eventsIn(unfolded: string): RawEvent[] {
  const events: RawEvent[] = [];
  let depth = 0;
  let current: RawEvent | undefined;
  for (const line of unfolded.split("\n")) {
    const mark = marker(line);
    if (mark !== undefined) {
      if (mark.kind === "BEGIN") {
        if (mark.name === "VEVENT" && depth === 0) {
          current = {};
          depth = 1;
        } else if (depth > 0) {
          depth += 1;
        }
      } else if (depth > 0) {
        depth -= 1;
        if (depth === 0 && current !== undefined) {
          events.push(current);
          current = undefined;
        }
      }
      continue;
    }
    if (depth === 1 && current !== undefined) takeProperty(current, line);
  }
  return events;
}

function marker(
  line: string,
): { kind: "BEGIN" | "END"; name: string } | undefined {
  const trimmed = line.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return undefined;
  const key = trimmed.slice(0, colon).toUpperCase();
  if (key !== "BEGIN" && key !== "END") return undefined;
  const name = (trimmed.slice(colon + 1).split(";")[0] ?? "")
    .trim()
    .toUpperCase();
  if (name === "") return undefined;
  return { kind: key, name };
}

function takeProperty(event: RawEvent, line: string): void {
  const split = splitNameAndValue(line);
  if (split === undefined) return;
  const parsed = parseLeft(split.left);
  if (parsed === undefined) return;
  const { name, params } = parsed;
  if (name === "SUMMARY" && event.summary === undefined) {
    event.summary = unescapeText(split.value);
  } else if (name === "LOCATION" && event.location === undefined) {
    event.location = unescapeText(split.value);
  } else if (name === "DESCRIPTION" && event.description === undefined) {
    event.description = unescapeText(split.value);
  } else if (name === "DTSTART" && event.dtstart === undefined) {
    event.dtstart = { value: split.value.trim(), params };
  } else if (name === "DTEND" && event.dtend === undefined) {
    event.dtend = { value: split.value.trim(), params };
  }
}

function splitNameAndValue(
  line: string,
): { left: string; value: string } | undefined {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      return { left: line.slice(0, i), value: line.slice(i + 1) };
    }
  }
  return undefined;
}

function parseLeft(
  left: string,
): { name: string; params: Map<string, string> } | undefined {
  const parts = splitSemicolons(left);
  const name = parts[0]?.trim().toUpperCase() ?? "";
  if (name === "") return undefined;
  const params = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    if (key === "") continue;
    params.set(key, unquote(part.slice(eq + 1)));
  }
  return { name, params };
}

function splitSemicolons(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (ch === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** RFC 5545 text: `\\`, `\;`, `\,`, and `\\n` / `\\N`. */
function unescapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\" || i + 1 >= value.length) {
      out += ch ?? "";
      continue;
    }
    const next = value[i + 1];
    if (next === "n" || next === "N") {
      out += "\n";
      i += 1;
    } else if (next === "\\" || next === ";" || next === ",") {
      out += next;
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function flightFromEvent(
  event: RawEvent,
  lookup: (iata: string) => AirportHit | undefined,
  known: (timeZone: string) => boolean,
): Candidate | undefined {
  const summary = event.summary ?? "";
  const location = event.location ?? "";
  const description = event.description ?? "";
  const pair = endpointPair(summary, location, description, lookup);
  if (pair === undefined) return undefined;
  if (event.dtstart === undefined || event.dtend === undefined)
    return undefined;
  const startWall = parseWall(event.dtstart.value, event.dtstart.params);
  const endWall = parseWall(event.dtend.value, event.dtend.params);
  if (
    startWall === "date" ||
    endWall === "date" ||
    startWall === "invalid" ||
    endWall === "invalid"
  ) {
    return undefined;
  }
  if (startWall.kind === "zoned" && !knownZone(startWall.tz, known)) {
    return undefined;
  }
  if (endWall.kind === "zoned" && !knownZone(endWall.tz, known)) {
    return undefined;
  }
  // A floating value has no zone of its own: DTSTART is local at the
  // departure airport, DTEND at the arrival airport.
  const start = toInstant(startWall, pair.from.tz, known);
  const end = toInstant(endWall, pair.to.tz, known);
  if (start === undefined || end === undefined) return undefined;
  const span = end.epochNanoseconds - start.epochNanoseconds;
  if (span <= 0n || span > DAY_NS) return undefined;
  const departure = toLocal(start, pair.from.tz);
  const arrival = toLocal(end, pair.to.tz);
  if (departure === undefined || arrival === undefined) return undefined;
  const flight: ImportedFlight = {
    fromIata: pair.from.iata,
    toIata: pair.to.iata,
    departureDate: departure.date,
    departureTime: departure.time,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
  };
  const flightNumber = readFlightNumber(summary, description);
  if (flightNumber !== undefined) flight.flightNumber = flightNumber;
  return { flight, at: start };
}

/**
 * The first field that names any known airport decides the route. It must
 * name exactly two different ones, in reading order. Otherwise this event
 * is not a flight, and later fields are not consulted.
 */
function endpointPair(
  summary: string,
  location: string,
  description: string,
  lookup: (iata: string) => AirportHit | undefined,
): { from: AirportHit; to: AirportHit } | undefined {
  for (const field of [summary, location, description]) {
    const hits = knownAirports(field, lookup);
    if (hits.length === 0) continue;
    const distinct: AirportHit[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.has(hit.iata)) continue;
      seen.add(hit.iata);
      distinct.push(hit);
    }
    if (distinct.length !== 2) return undefined;
    const from = distinct[0];
    const to = distinct[1];
    if (from === undefined || to === undefined) return undefined;
    return { from, to };
  }
  return undefined;
}

/**
 * Common capitalised English words that are also IATA codes; an all-caps
 * summary such as "FLIGHT TO SFO AND BACK" must not read AND as an airport.
 */
const NOT_AIRPORTS: ReadonlySet<string> = new Set([
  "THE",
  "AND",
  "FOR",
  "ARE",
  "BUT",
  "NOT",
  "YOU",
  "ALL",
  "ANY",
  "CAN",
  "HAS",
  "HER",
  "WAS",
  "ONE",
  "OUR",
  "OUT",
  "DAY",
  "GET",
  "HIM",
  "HIS",
  "HOW",
  "MAN",
  "NEW",
  "NOW",
  "OLD",
  "SEE",
  "TWO",
  "WAY",
  "WHO",
  "BOY",
  "DID",
  "ITS",
  "LET",
  "PUT",
  "SAY",
  "SHE",
  "TOO",
  "USE",
  "VIA",
  "BAG",
  "SEA",
  "AIR",
  "FLY",
  "ARR",
  "DEP",
  "GMT",
  "UTC",
  "EST",
  "PST",
  "CET",
]);

function knownAirports(
  text: string,
  lookup: (iata: string) => AirportHit | undefined,
): AirportHit[] {
  const found: AirportHit[] = [];
  for (const match of text.matchAll(/\b[A-Z]{3}\b/g)) {
    if (NOT_AIRPORTS.has(match[0])) continue;
    const airport = lookup(match[0]);
    if (airport !== undefined) found.push(airport);
  }
  return found;
}

function readFlightNumber(
  summary: string,
  description: string,
): string | undefined {
  const match = FLIGHT_NUMBER.exec(summary) ?? FLIGHT_NUMBER.exec(description);
  if (match === null) return undefined;
  const prefix = match[1];
  const digits = match[2];
  if (prefix === undefined || digits === undefined) return undefined;
  return `${prefix}${digits}`;
}

function parseWall(
  value: string,
  params: ReadonlyMap<string, string>,
): WallTime | "date" | "invalid" {
  const valueType = params.get("VALUE");
  if (valueType !== undefined && valueType.toUpperCase() === "DATE") {
    return "date";
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(
    value.trim(),
  );
  if (match === null) {
    return /^\d{8}$/.test(value.trim()) ? "date" : "invalid";
  }
  const tzid = params.get("TZID");
  if (match[7] === "Z") return wallFromMatch(match, "utc");
  if (tzid !== undefined && tzid !== "")
    return wallFromMatch(match, "zoned", tzid);
  return wallFromMatch(match, "floating");
}

function wallFromMatch(
  match: RegExpExecArray,
  kind: WallTime["kind"],
  tz?: string,
): WallTime | "invalid" {
  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return "invalid";
  }
  return {
    kind,
    ...(tz === undefined ? {} : { tz }),
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function knownZone(
  timeZone: string | undefined,
  known: (timeZone: string) => boolean,
): boolean {
  return timeZone !== undefined && timeZone !== "" && known(timeZone);
}

function toInstant(
  wall: WallTime,
  fallbackZone: string,
  known: (timeZone: string) => boolean,
): Temporal.Instant | undefined {
  try {
    if (wall.kind === "utc") {
      return Temporal.Instant.from(
        `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}Z`,
      );
    }
    const zone = wall.kind === "zoned" ? wall.tz : fallbackZone;
    if (zone === undefined || !known(zone)) return undefined;
    return Temporal.PlainDateTime.from({
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
    })
      .toZonedDateTime(zone)
      .toInstant();
  } catch {
    return undefined;
  }
}

function toLocal(
  instant: Temporal.Instant,
  timeZone: string,
): { date: string; time: string } | undefined {
  try {
    const zoned = instant.toZonedDateTimeISO(timeZone);
    return {
      date: `${pad(zoned.year, 4)}-${pad(zoned.month)}-${pad(zoned.day)}`,
      time: `${pad(zoned.hour)}:${pad(zoned.minute)}`,
    };
  } catch {
    return undefined;
  }
}

function zoneCache(): (timeZone: string) => boolean {
  const known = new Map<string, boolean>();
  return (timeZone: string): boolean => {
    const cached = known.get(timeZone);
    if (cached !== undefined) return cached;
    let ok = true;
    try {
      Temporal.Instant.from("2020-01-01T00:00:00Z").toZonedDateTimeISO(
        timeZone,
      );
    } catch {
      ok = false;
    }
    known.set(timeZone, ok);
    return ok;
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}
