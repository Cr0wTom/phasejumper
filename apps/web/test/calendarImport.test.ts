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
import {
  parseCalendarFlights,
  type ImportedFlight,
} from "../src/calendarImport";

const ZONES: Readonly<Record<string, string>> = {
  PRG: "Europe/Prague",
  FRA: "Europe/Berlin",
  SFO: "America/Los_Angeles",
  // Real IATA codes that are also English words.
  AND: "America/New_York",
  THE: "America/Fortaleza",
};

const airports = {
  lookup(iata: string): { iata: string; tz: string } | undefined {
    const tz = ZONES[iata];
    return tz === undefined ? undefined : { iata, tz };
  },
};

function ics(events: readonly string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function vevent(lines: readonly string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

function flight(
  partial: Pick<ImportedFlight, "fromIata" | "toIata"> &
    Partial<ImportedFlight>,
): ImportedFlight {
  return {
    departureDate: "2027-01-15",
    departureTime: "10:30",
    arrivalDate: "2027-01-15",
    arrivalTime: "13:05",
    ...partial,
  };
}

describe("parseCalendarFlights", () => {
  it("reads a TripIt-style event as local airport times", () => {
    // SUMMARY names the route. LOCATION is the airport's name and is not used.
    // The wall times are already in each airport's zone.
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "LOCATION:Václav Havel Airport Prague",
        "DESCRIPTION:LH 455",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({ fromIata: "PRG", toIata: "SFO", flightNumber: "LH455" }),
      ],
    });
  });

  it("converts UTC instants to PRG 10:30 and SFO 13:05 on the same day", () => {
    // 09:30Z is 10:30 in Prague (UTC+1 in January). 21:05Z is 13:05 in
    // San Francisco (UTC−8). The elapsed flight is under 24 h.
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART:20270115T093000Z",
        "DTEND:20270115T210500Z",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [flight({ fromIata: "PRG", toIata: "SFO" })],
    });
  });

  it("skips a Google-style event that names only one airport", () => {
    // Intended strictness. SUMMARY is "Flight to San Francisco (LH 455)":
    // a city name and a flight number, and no IATA code. LOCATION is
    // "Prague PRG", one known code. The first field that contains a known
    // code does not contain exactly two, so the event is skipped. The city
    // is not guessed, and the flight number is not a route.
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:Flight to San Francisco (LH 455)",
      "LOCATION:Prague PRG",
      "DTSTART:20270115T093000Z",
      "DTEND:20270115T210500Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("reads two airports from the description when earlier fields have none", () => {
    const text = ics([
      vevent([
        "SUMMARY:Flight home",
        "LOCATION:Gate 12",
        "DESCRIPTION:PRG → SFO",
        "DTSTART;VALUE=DATE-TIME;TZID=Europe/Prague:20270116T103000",
        "DTEND;TZID=America/Los_Angeles:20270116T130500",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({
          fromIata: "PRG",
          toIata: "SFO",
          departureDate: "2027-01-16",
          arrivalDate: "2027-01-16",
        }),
      ],
    });
  });

  it("reads a floating time as local at the departure and arrival airports", () => {
    // 22:00 in Prague is 21:00Z. 18:00 the same calendar day in San Francisco
    // is 02:00Z the next day, so the end is later even though the wall clock
    // looks earlier. Both values have no Z and no TZID.
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART:20270115T220000",
        "DTEND:20270115T180000",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({
          fromIata: "PRG",
          toIata: "SFO",
          departureTime: "22:00",
          arrivalTime: "18:00",
        }),
      ],
    });
  });

  it("unfolds a folded line and unescapes commas and newlines", () => {
    // The trailing space on the description is content. The leading space on
    // the next line is the fold. `\\n` between the codes is an escaped
    // newline, so both airports are visible only after unescaping.
    const text = ics([
      vevent([
        "SUMMARY:Notes",
        "LOCATION:Hall",
        "DESCRIPTION:Gate\\, then ",
        " PRG\\nSFO",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [flight({ fromIata: "PRG", toIata: "SFO" })],
    });
  });

  it("skips an all-day event", () => {
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART;VALUE=DATE:20270115",
        "DTEND;VALUE=DATE:20270116",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("skips a meeting that names no airport", () => {
    const text = ics([
      vevent([
        "SUMMARY:Weekly planning",
        "LOCATION:Room 4",
        "DTSTART;TZID=Europe/Prague:20270115T090000",
        "DTEND;TZID=Europe/Prague:20270115T100000",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("skips an event whose first coded field names three airports", () => {
    // SUMMARY has three known codes, so the event is not a flight.
    // DESCRIPTION names exactly two and is not consulted.
    const text = ics([
      vevent([
        "SUMMARY:PRG FRA SFO",
        "DESCRIPTION:PRG to SFO",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("skips an event that ends before or when it starts", () => {
    const before = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART;TZID=Europe/Prague:20270115T180000",
        "DTEND;TZID=Europe/Prague:20270115T100000",
      ]),
    ]);
    const sameInstant = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART:20270115T093000Z",
        "DTEND:20270115T093000Z",
      ]),
    ]);
    expect(parseCalendarFlights(before, airports)).toEqual({
      ok: true,
      flights: [],
    });
    expect(parseCalendarFlights(sameInstant, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("returns a two-leg trip in departure order", () => {
    const text = ics([
      vevent([
        "SUMMARY:FRA to SFO",
        "DTSTART;TZID=Europe/Berlin:20270115T140000",
        "DTEND;TZID=America/Los_Angeles:20270115T160000",
      ]),
      vevent([
        "SUMMARY:PRG to FRA",
        "DTSTART;TZID=Europe/Prague:20270115T080000",
        "DTEND;TZID=Europe/Berlin:20270115T091000",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({
          fromIata: "PRG",
          toIata: "FRA",
          departureTime: "08:00",
          arrivalTime: "09:10",
        }),
        flight({
          fromIata: "FRA",
          toIata: "SFO",
          departureTime: "14:00",
          arrivalTime: "16:00",
        }),
      ],
    });
  });

  it("drops a later copy of the same from, to and departure", () => {
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DESCRIPTION:LH 455",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
      vevent([
        "SUMMARY:PRG to SFO",
        "DESCRIPTION:BA 9",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T140000",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({ fromIata: "PRG", toIata: "SFO", flightNumber: "LH455" }),
      ],
    });
  });

  it("never reads an all-caps English word as an airport", () => {
    const text = ics([
      vevent([
        "SUMMARY:FLIGHT TO SFO AND BACK FROM PRG",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
      vevent([
        "SUMMARY:THE TRIP: SFO AND MORE",
        "DTSTART;TZID=Europe/Prague:20270116T103000",
        "DTEND;TZID=America/Los_Angeles:20270116T130500",
      ]),
    ]);
    // First: SFO and PRG only (AND ignored) -> SFO to PRG in reading order.
    // Second: only SFO is left -> skipped.
    const parsed = parseCalendarFlights(text, airports);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.flights.map((f) => `${f.fromIata}-${f.toIata}`)).toEqual([
      "SFO-PRG",
    ]);
  });

  it("rejects text that has no BEGIN:VCALENDAR", () => {
    expect(parseCalendarFlights("Hello", airports)).toEqual({
      ok: false,
      reason: "not-calendar",
    });
    expect(
      parseCalendarFlights(
        "BEGIN:VEVENT\nSUMMARY:PRG to SFO\nEND:VEVENT\n",
        airports,
      ),
    ).toEqual({ ok: false, reason: "not-calendar" });
  });

  it("skips an event whose TZID Temporal does not know", () => {
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART;TZID=Mars/Olympus:20270115T103000",
        "DTEND;TZID=America/Los_Angeles:20270115T130500",
      ]),
      vevent([
        "SUMMARY:PRG to FRA",
        "DTSTART;TZID=Europe/Prague:20270115T080000",
        "DTEND;TZID=Europe/Berlin:20270115T091000",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({
          fromIata: "PRG",
          toIata: "FRA",
          departureTime: "08:00",
          arrivalTime: "09:10",
        }),
      ],
    });
  });

  it("skips an event with no end, and one longer than 24 h", () => {
    const noEnd = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART;TZID=Europe/Prague:20270115T103000",
      ]),
    ]);
    const tooLong = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART:20270115T093000Z",
        "DTEND:20270116T093100Z",
      ]),
    ]);
    expect(parseCalendarFlights(noEnd, airports)).toEqual({
      ok: true,
      flights: [],
    });
    expect(parseCalendarFlights(tooLong, airports)).toEqual({
      ok: true,
      flights: [],
    });
  });

  it("keeps an event that lasts exactly 24 h", () => {
    // 09:30Z on the 16th is 01:30 in San Francisco, exactly one day later.
    const text = ics([
      vevent([
        "SUMMARY:PRG to SFO",
        "DTSTART:20270115T093000Z",
        "DTEND:20270116T093000Z",
      ]),
    ]);
    expect(parseCalendarFlights(text, airports)).toEqual({
      ok: true,
      flights: [
        flight({
          fromIata: "PRG",
          toIata: "SFO",
          arrivalDate: "2027-01-16",
          arrivalTime: "01:30",
        }),
      ],
    });
  });
});
