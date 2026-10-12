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

import {
  generatePlan,
  type PlanInput,
  type PlanResult,
} from "@phasejumper/engine";
import ICAL from "ical.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { bannedCopyPattern } from "../../../scripts/banned-terms";
import { toIcs } from "../src/toIcs";
import { vtimezoneComponent } from "../src/vtimezone";

const DIR = fileURLToPath(
  new URL("../../engine/test/fixtures/", import.meta.url),
);

const EXPORTED = new Set([
  "SLEEP",
  "SLEEP_INFLIGHT",
  "NAP",
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
  "AVOID_LIGHT",
  "EXERCISE_GOOD",
  "EXERCISE_OPTIONAL_WALK",
  "WIND_DOWN",
  "NSDR",
  "CAFFEINE_STOP",
  "MELATONIN_WINDOW",
]);

const HIDDEN = ["MEAL", "EXERCISE_AVOID", "CAFFEINE_OK", "CAFFEINE_LATE_OK"];

const TEN_MIN = new Set([
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
  "MELATONIN_WINDOW",
  "CAFFEINE_STOP",
]);

const THIRTY_MIN = new Set(["SLEEP", "SLEEP_INFLIGHT"]);

const MARKER = new Set(["CAFFEINE_STOP", "MELATONIN_WINDOW"]);

function names(): string[] {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".input.json"))
    .map((file) => file.replace(".input.json", ""))
    .sort();
}

function load(name: string): PlanInput {
  return JSON.parse(
    readFileSync(`${DIR}${name}.input.json`, "utf8"),
  ) as PlanInput;
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
}

function parseCalendar(ics: string): ICAL.Component {
  const errors: unknown[] = [];
  const parser = new ICAL.ComponentParser();
  parser.onerror = (error: unknown) => {
    errors.push(error);
  };
  parser.process(ics);
  expect(errors, errors.map(String).join("\n")).toEqual([]);
  return new ICAL.Component(ICAL.parse(ics));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function wallFrom(time: ICAL.Time): string {
  return `${time.year}-${pad(time.month)}-${pad(time.day)}T${pad(time.hour)}:${pad(time.minute)}`;
}

function wallFromZoned(zoned: Temporal.ZonedDateTime): string {
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
}

function param(property: ICAL.Property, name: string): string {
  const value: unknown = property.getParameter(name);
  if (typeof value !== "string") {
    throw new Error(`missing ${name}`);
  }
  return value;
}

interface ExpectedEvent {
  tz: string;
  startWall: string;
  endTz: string;
  endWall: string;
  utcSeconds: number;
}

function expectedEvents(
  planId: string,
  input: PlanInput,
  result: PlanResult,
): Map<string, ExpectedEvent> {
  const out = new Map<string, ExpectedEvent>();
  for (const [dayIndex, day] of result.days.entries()) {
    const seen = new Map<string, number>();
    for (const block of day.blocks) {
      if (!EXPORTED.has(block.kind)) continue;
      const n = seen.get(block.kind) ?? 0;
      seen.set(block.kind, n + 1);
      const start = Temporal.Instant.from(block.startUtc).toZonedDateTimeISO(
        block.localTz,
      );
      const end = MARKER.has(block.kind)
        ? start.add({ minutes: 5 })
        : Temporal.Instant.from(block.endUtc).toZonedDateTimeISO(block.localTz);
      out.set(`pj-${planId}-${dayIndex}-${block.kind}-${n}@phasejumper`, {
        tz: block.localTz,
        startWall: wallFromZoned(start),
        endTz: block.localTz,
        endWall: wallFromZoned(end),
        utcSeconds: Math.round(start.epochMilliseconds / 1000),
      });
    }
  }
  input.itinerary.legs.forEach((leg, index) => {
    const start = Temporal.PlainDateTime.from(
      leg.departureLocal,
    ).toZonedDateTime(leg.departureTz);
    const end = Temporal.PlainDateTime.from(leg.arrivalLocal).toZonedDateTime(
      leg.arrivalTz,
    );
    out.set(`pj-${planId}-leg-${index}@phasejumper`, {
      tz: leg.departureTz,
      startWall: wallFromZoned(start),
      endTz: leg.arrivalTz,
      endWall: wallFromZoned(end),
      utcSeconds: Math.round(start.epochMilliseconds / 1000),
    });
  });
  return out;
}

function exportableCount(input: PlanInput, result: PlanResult): number {
  const blocks = result.days.reduce(
    (count, day) =>
      count + day.blocks.filter((block) => EXPORTED.has(block.kind)).length,
    0,
  );
  return blocks + input.itinerary.legs.length;
}

describe("toIcs", () => {
  const fixtures = names();

  it("covers the eight golden fixtures", () => {
    expect(fixtures).toEqual([
      "hel-dec-dark",
      "nyc-lon-dst",
      "prg-jfk-meetings",
      "prg-lhr-light-touch",
      "prg-sfo-delay",
      "prg-syd-antidromic",
      "prg-tyo-advance",
      "sfo-prg-quick",
    ]);
  });

  it.each(fixtures)(
    "%s parses, counts events, and keeps wall times",
    (name) => {
      const input = load(name);
      const result = generatePlan(input);
      const planId = `plan-${name}`;
      const ics = toIcs({ planId, input, result, sequence: 2 });
      expect(ics).toBe(toIcs({ planId, input, result, sequence: 2 }));

      const text = unfold(ics);
      const calendar = parseCalendar(ics);
      expect(text).toContain("METHOD:PUBLISH");
      expect(text).toContain(
        `PRODID:-//PhaseJumper//PhaseJumper ${result.engineVersion}//EN`,
      );
      const origin = input.itinerary.legs[0]?.departureAirport;
      const destination = input.itinerary.legs.at(-1)?.arrivalAirport;
      expect(text).toContain(
        `X-WR-CALNAME:PhaseJumper — ${origin} → ${destination}`,
      );
      expect(text).not.toMatch(bannedCopyPattern());
      for (const kind of HIDDEN) {
        expect(text).not.toContain(`-${kind}-`);
      }

      const expected = expectedEvents(planId, input, result);
      const events = calendar.getAllSubcomponents("vevent");
      expect(events).toHaveLength(exportableCount(input, result));
      expect(events).toHaveLength(expected.size);

      const used = new Set<string>();
      for (const vevent of events) {
        const event = new ICAL.Event(vevent);
        const want = expected.get(event.uid);
        expect(want, event.uid).toBeDefined();
        if (want === undefined) continue;
        const startProp = vevent.getFirstProperty("dtstart");
        const endProp = vevent.getFirstProperty("dtend");
        expect(startProp).not.toBeNull();
        expect(endProp).not.toBeNull();
        if (startProp === null || endProp === null) continue;
        const startTz = param(startProp, "tzid");
        const endTz = param(endProp, "tzid");
        used.add(startTz);
        used.add(endTz);
        expect(startTz).toBe(want.tz);
        expect(endTz).toBe(want.endTz);
        expect(wallFrom(event.startDate)).toBe(want.startWall);
        expect(wallFrom(event.endDate)).toBe(want.endWall);
        expect(event.startDate.toUnixTime()).toBe(want.utcSeconds);
        expect(event.sequence).toBe(2);
        expect(vevent.getFirstPropertyValue("categories")).toBe("PhaseJumper");
        expect(text).toContain(`COLOR:`);

        // pj-<planId>-<dayIndex>-<kind>-<n>@phasejumper, or pj-<planId>-leg-<i>@…
        const kind = event.uid
          .replace(/@phasejumper$/, "")
          .split("-")
          .at(-2);
        if (kind === undefined) throw new Error(`bad uid ${event.uid}`);
        const uidAt = text.indexOf(`UID:${event.uid}\n`);
        const body = text.slice(uidAt, text.indexOf("END:VEVENT", uidAt));
        if (TEN_MIN.has(kind)) {
          expect(body).toContain("BEGIN:VALARM");
          expect(body).toContain("ACTION:DISPLAY");
          expect(body).toContain("TRIGGER:-PT10M");
          expect(body).toContain("An alert in your calendar.");
        } else if (THIRTY_MIN.has(kind)) {
          expect(body).toContain("TRIGGER:-PT30M");
        } else {
          expect(body).not.toContain("BEGIN:VALARM");
        }
      }

      const defined = new Set(
        [...text.matchAll(/^TZID:(.*)$/gm)].map((match) => match[1] ?? ""),
      );
      for (const zone of used) expect(defined.has(zone)).toBe(true);
    },
  );

  it("keeps UIDs and increments SEQUENCE on re-export", () => {
    const input = load("prg-sfo-delay");
    const result = generatePlan(input);
    const first = unfold(toIcs({ planId: "same", input, result, sequence: 4 }));
    const second = unfold(
      toIcs({ planId: "same", input, result, sequence: 5 }),
    );
    const uids = (text: string): string[] =>
      [...text.matchAll(/^UID:(.*)$/gm)].map((match) => match[1] ?? "");
    const sequences = (text: string): string[] =>
      [...text.matchAll(/^SEQUENCE:(.*)$/gm)].map((match) => match[1] ?? "");
    expect(uids(second)).toEqual(uids(first));
    expect(new Set(sequences(first))).toEqual(new Set(["4"]));
    expect(new Set(sequences(second))).toEqual(new Set(["5"]));
  });

  it("adds the flight number when the leg has one", () => {
    const input = load("prg-sfo-delay");
    const leg = input.itinerary.legs[0];
    if (leg === undefined) throw new Error("missing leg");
    leg.flightNumber = "OK123";
    const text = unfold(
      toIcs({
        planId: "flight",
        input,
        result: generatePlan(input),
        sequence: 0,
      }),
    );
    expect(text).toContain("SUMMARY:Flight PRG to SFO (OK123)");
  });

  it("round-trips the DST fixture to the same wall times", () => {
    const input = load("nyc-lon-dst");
    const result = generatePlan(input);
    const ics = toIcs({ planId: "dst", input, result, sequence: 0 });
    const calendar = parseCalendar(ics);
    const expected = expectedEvents("dst", input, result);
    for (const vevent of calendar.getAllSubcomponents("vevent")) {
      const event = new ICAL.Event(vevent);
      const want = expected.get(event.uid);
      expect(want, event.uid).toBeDefined();
      if (want === undefined) continue;
      expect(wallFrom(event.startDate)).toBe(want.startWall);
      expect(event.startDate.zone.tzid).toBe(want.tz);
    }
  });
});

describe("vtimezoneComponent", () => {
  it("uses one STANDARD component when the zone never changes", () => {
    const text = vtimezoneComponent(
      "Etc/UTC",
      Temporal.Instant.from("2027-03-01T00:00:00Z"),
      Temporal.Instant.from("2027-04-01T00:00:00Z"),
    );
    expect(text.match(/BEGIN:STANDARD/g)).toHaveLength(1);
    expect(text).not.toContain("BEGIN:DAYLIGHT");
    expect(text).toContain("TZOFFSETFROM:+0000");
    expect(text).toContain("TZOFFSETTO:+0000");
    expect(text).toContain("TZID:Etc/UTC");
  });

  it("emits the New York spring transition with the offsets it leaves and enters", () => {
    const text = vtimezoneComponent(
      "America/New_York",
      Temporal.Instant.from("2027-03-01T00:00:00Z"),
      Temporal.Instant.from("2027-04-01T00:00:00Z"),
    );
    expect(text).toContain("BEGIN:DAYLIGHT");
    expect(text).toContain("DTSTART:20270314T020000");
    expect(text).toContain("TZOFFSETFROM:-0500");
    expect(text).toContain("TZOFFSETTO:-0400");
  });
});
