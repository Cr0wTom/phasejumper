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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lookup } from "../src/index";

const MAX_GZIPPED_BYTES = 600 * 1024;

const fixtures: ReadonlyArray<{
  iata: string;
  tz: string;
  observesDst: boolean;
}> = [
  { iata: "PRG", tz: "Europe/Prague", observesDst: true },
  { iata: "SFO", tz: "America/Los_Angeles", observesDst: true },
  { iata: "JFK", tz: "America/New_York", observesDst: true },
  { iata: "LHR", tz: "Europe/London", observesDst: true },
  { iata: "CDG", tz: "Europe/Paris", observesDst: true },
  { iata: "SYD", tz: "Australia/Sydney", observesDst: true },
  { iata: "AKL", tz: "Pacific/Auckland", observesDst: true },
  { iata: "ORD", tz: "America/Chicago", observesDst: true },
  { iata: "FRA", tz: "Europe/Berlin", observesDst: true },
  { iata: "MEL", tz: "Australia/Melbourne", observesDst: true },
  { iata: "PHX", tz: "America/Phoenix", observesDst: false },
  { iata: "HNL", tz: "Pacific/Honolulu", observesDst: false },
  { iata: "DXB", tz: "Asia/Dubai", observesDst: false },
  { iata: "SIN", tz: "Asia/Singapore", observesDst: false },
  { iata: "NRT", tz: "Asia/Tokyo", observesDst: false },
  { iata: "HKG", tz: "Asia/Hong_Kong", observesDst: false },
  { iata: "BKK", tz: "Asia/Bangkok", observesDst: false },
  { iata: "DEL", tz: "Asia/Kolkata", observesDst: false },
  { iata: "JNB", tz: "Africa/Johannesburg", observesDst: false },
  { iata: "BOG", tz: "America/Bogota", observesDst: false },
];

function part(parts: Readonly<Record<string, string>>, name: string): number {
  const raw = parts[name];
  if (raw === undefined) throw new Error(`missing date part ${name}`);
  return Number(raw);
}

function offsetMinutes(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const piece of formatter.formatToParts(instant)) {
    if (piece.type !== "literal") parts[piece.type] = piece.value;
  }
  const zoned = Date.UTC(
    part(parts, "year"),
    part(parts, "month") - 1,
    part(parts, "day"),
    part(parts, "hour") % 24,
    part(parts, "minute"),
    part(parts, "second"),
  );
  return (zoned - instant.getTime()) / 60_000;
}

describe("lookup", () => {
  it("resolves PRG to Europe/Prague", () => {
    expect(lookup("PRG")).toEqual({
      iata: "PRG",
      icao: "LKPR",
      name: "Václav Havel Airport Prague",
      city: "Prague",
      country: "CZ",
      lat: 50.100874,
      lon: 14.259911,
      tz: "Europe/Prague",
    });
  });

  it("resolves SFO to America/Los_Angeles", () => {
    expect(lookup("SFO")).toEqual({
      iata: "SFO",
      icao: "KSFO",
      name: "San Francisco International Airport",
      city: "San Francisco",
      country: "US",
      lat: 37.619806,
      lon: -122.374821,
      tz: "America/Los_Angeles",
    });
  });

  it("returns undefined for an unknown IATA code", () => {
    expect(lookup("XXX")).toBeUndefined();
    expect(lookup("toString")).toBeUndefined();
    expect(lookup("constructor")).toBeUndefined();
  });

  it("covers 20 DST and non-DST zones", () => {
    expect(fixtures).toHaveLength(20);
    expect(fixtures.filter((fixture) => fixture.observesDst)).toHaveLength(10);
    expect(fixtures.filter((fixture) => !fixture.observesDst)).toHaveLength(10);
  });

  it.each(fixtures)("$iata is $tz (DST=$observesDst)", (fixture) => {
    expect(lookup(fixture.iata)?.tz).toBe(fixture.tz);
    const january = offsetMinutes(
      fixture.tz,
      new Date(Date.UTC(2026, 0, 15, 12)),
    );
    const july = offsetMinutes(fixture.tz, new Date(Date.UTC(2026, 6, 15, 12)));
    expect(january !== july).toBe(fixture.observesDst);
  });

  it("keeps airports.json within 600 KB gzipped", () => {
    const path = fileURLToPath(
      new URL("../src/airports.json", import.meta.url),
    );
    const json = readFileSync(path, "utf8");
    expect(gzipSync(json).byteLength).toBeLessThanOrEqual(MAX_GZIPPED_BYTES);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toBeTypeOf("object");
    expect(parsed).not.toBeNull();
    if (typeof parsed === "object" && parsed !== null) {
      expect(Object.keys(parsed)).toHaveLength(4133);
    }
  });
});
