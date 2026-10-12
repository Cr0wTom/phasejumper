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

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseItinerary, type ParseResult } from "../src/index";

const DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/**
 * Yearless dates infer a year from this reference (on or after it).
 * In klm-yearless, 3 Nov is 2026-11-03 and 12 Jan is 2027-01-12.
 */
const REFERENCE: Readonly<Record<string, string>> = {
  "klm-yearless": "2026-10-12",
};

const NAMES = [
  "aegean-short-labels",
  "aircanada-arrow",
  "airfrance-iso",
  "american-hyphen",
  "ana-paren-plus",
  "austrian-sameline",
  "british-weekday",
  "delta-twelve-hour",
  "easyjet-compact",
  "emirates-plus-one",
  "finnair-iso",
  "hotel-booking",
  "iberia-cities",
  "jal-same-day",
  "klm-yearless",
  "lufthansa-labeled",
  "marketing-email",
  "qantas-twelve-hour",
  "qatar-three-leg",
  "random-prose",
  "singapore-plus-day",
  "swiss-connection",
  "turkish-order",
  "united-dot-time",
  "virgin-plus-one",
] as const;

function readText(name: string): string {
  return readFileSync(`${DIR}${name}.txt`, "utf8");
}

function readExpected(name: string): ParseResult {
  return JSON.parse(
    readFileSync(`${DIR}${name}.expected.json`, "utf8"),
  ) as ParseResult;
}

describe("fixture texts", () => {
  it("has the 25 confirmation texts", () => {
    const texts = readdirSync(DIR).filter((name) => name.endsWith(".txt"));
    expect(texts.sort()).toEqual(NAMES.map((name) => `${name}.txt`));
  });

  it.each(NAMES)("%s matches its expected legs", (name) => {
    const referenceDate = REFERENCE[name];
    const result = parseItinerary(
      readText(name),
      referenceDate === undefined ? undefined : { referenceDate },
    );
    expect(result).toEqual(readExpected(name));
  });
});

describe("parseItinerary", () => {
  const one = `Flight BA 10
From LHR to PRG
3 Nov
Departs 09:00
Arrives 12:00
`;

  it("returns no legs for empty text", () => {
    expect(parseItinerary("  \n")).toEqual({
      legs: [],
      confidence: 0,
      unparsed: [],
    });
  });

  it("leaves a yearless date unparsed when no reference date is supplied", () => {
    const result = parseItinerary(one);
    expect(result.legs).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.unparsed).toContain("Flight BA 10");
    expect(result.unparsed).toContain("Departs 09:00");
  });

  it("uses the reference date when it falls on that month and day", () => {
    const result = parseItinerary(one, { referenceDate: "2026-11-03" });
    expect(result.legs[0]?.departureDate).toBe("2026-11-03");
  });

  it("rolls a yearless date to the next year when it is before the reference", () => {
    const result = parseItinerary(one, { referenceDate: "2026-11-04" });
    expect(result.legs[0]?.departureDate).toBe("2027-11-03");
  });

  it("picks the next real 29 Feb on or after the reference date", () => {
    const result = parseItinerary(
      "BA 1 LHR-PRG 29 Feb\nDeparts 09:00\nArrives 12:00\n",
      { referenceDate: "2027-01-01" },
    );
    expect(result.legs[0]?.departureDate).toBe("2028-02-29");
  });

  it("treats an unusable reference date as omitted", () => {
    expect(parseItinerary(one, { referenceDate: "2026/11/03" }).legs).toEqual(
      [],
    );
  });

  it("converts 12 AM and 12 PM", () => {
    const result = parseItinerary("BA 10 LHR-PRG 1 May 2027 12:00 AM 12:00 PM");
    expect(result.legs[0]?.departureTime).toBe("00:00");
    expect(result.legs[0]?.arrivalTime).toBe("12:00");
  });

  it("reads a digit-letter flight number", () => {
    const result = parseItinerary("9W 401 BOM-PRG 2 May 2027 01:00 06:30");
    expect(result.legs[0]?.flightNumber).toBe("9W 401");
    expect(result.legs[0]?.departureAirport).toBe("BOM");
  });

  it("does not turn a gate code into a flight number", () => {
    const result = parseItinerary(`Gate A12
Flight LH 1
From PRG to JFK
12 Jan 2027
Departs 10:30
Arrives 13:45
`);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]?.flightNumber).toBe("LH 1");
    expect(result.unparsed).toEqual([]);
  });

  it("accepts any three-letter token in an airport position when no filter is set", () => {
    const text = `From THE to AND
12 Jan 2027
Departs 10:00
Arrives 12:00
`;
    const result = parseItinerary(text);
    expect(result.legs[0]?.departureAirport).toBe("THE");
    expect(result.legs[0]?.arrivalAirport).toBe("AND");
  });

  it("skips three-letter words the airport filter rejects", () => {
    const text = `FROM THE OFFICE
Flight LH 401
From PRG to JFK
12 Jan 2027
Departs 10:30
Arrives 13:45
`;
    const result = parseItinerary(text, {
      isAirport: (code) => code === "PRG" || code === "JFK",
    });
    expect(result.legs).toEqual([
      {
        flightNumber: "LH 401",
        departureAirport: "PRG",
        arrivalAirport: "JFK",
        departureDate: "2027-01-12",
        departureTime: "10:30",
        arrivalDate: "2027-01-12",
        arrivalTime: "13:45",
      },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("does not emit a partial leg", () => {
    const result = parseItinerary("From PRG to JFK\n12 Jan 2027\n");
    expect(result.legs).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.unparsed).toEqual(["From PRG to JFK"]);
  });

  it("returns the same result for the same input", () => {
    const text = readText("qatar-three-leg");
    expect(parseItinerary(text)).toEqual(parseItinerary(text));
  });

  it("parses 10 KB of text in under 50 ms", () => {
    let text = "";
    for (let i = 0; text.length < 10_000; i += 1) {
      text += `LH ${i}\nFrom PRG to JFK\n12 Jan 2027\nDeparts 10:30\nArrives 13:45\n\n`;
    }
    text = text.slice(0, 10_000);
    expect(text.length).toBe(10_000);
    // One warm-up parse (JIT, regex compilation), then the median of 7 runs:
    // a single cold timing on a shared CI runner measures the runner, not the
    // parser (it once read 86 ms on CI against ~10 ms locally).
    expect(parseItinerary(text).legs.length).toBeGreaterThan(0);
    const runs: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const start = performance.now();
      parseItinerary(text);
      runs.push(performance.now() - start);
    }
    const median = [...runs].sort((x, y) => x - y)[3] ?? Infinity;
    expect(median).toBeLessThan(50);
  });
});
