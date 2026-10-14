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

import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { generatePlan } from "../src";
import { leg, trip } from "./trips";

// A very early start with a short hop, a 1 h connection and a 13 h
// overnight flight, landing early in the morning.

const at = (local: string, zone: string): number =>
  Temporal.PlainDateTime.from(local).toZonedDateTime(zone).epochMilliseconds;

function hardTrip() {
  const input = trip(
    [
      leg(
        "PRG",
        "SFO",
        "2027-03-10T07:00",
        "2027-03-10T08:15",
        "Europe/Prague",
        "Europe/Berlin",
      ),
      leg(
        "SFO",
        "HND",
        "2027-03-10T09:15",
        "2027-03-11T06:15",
        "Europe/Berlin",
        "Asia/Singapore",
      ),
    ],
    "Asia/Singapore",
  );
  input.traveler.habitualBedtime = "21:00";
  input.traveler.habitualWake = "05:00";
  return { input, plan: generatePlan(input) };
}

describe("connections and overnight flights", () => {
  it("sleeps on board during a long overnight flight", () => {
    const { plan } = hardTrip();
    const longFlight = {
      s: at("2027-03-10T09:15", "Europe/Berlin"),
      e: at("2027-03-11T06:15", "Asia/Singapore"),
    };
    const onBoard = plan.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.kind === "SLEEP_INFLIGHT")
      .filter((b) => {
        const s = Temporal.Instant.from(b.startUtc).epochMilliseconds;
        return s >= longFlight.s && s < longFlight.e;
      });
    expect(onBoard.length).toBeGreaterThan(0);
  });

  it("puts the arrival walk after the final landing, not at the connection", () => {
    const { plan } = hardTrip();
    const connection = at("2027-03-10T08:15", "Europe/Berlin");
    const walks = plan.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.kind === "EXERCISE_OPTIONAL_WALK");
    for (const w of walks) {
      expect(Temporal.Instant.from(w.startUtc).epochMilliseconds).not.toBe(
        connection,
      );
    }
  });

  it("allows sleep in an overnight layover, awake 1 h before the connection", () => {
    // Land 22:00, connect 07:00 the next morning in the same zone.
    const input = trip(
      [
        leg(
          "PRG",
          "DXB",
          "2027-03-10T15:00",
          "2027-03-10T22:00",
          "Europe/Prague",
          "Asia/Dubai",
        ),
        leg(
          "DXB",
          "SYD",
          "2027-03-11T07:00",
          "2027-03-12T04:00",
          "Asia/Dubai",
          "Australia/Sydney",
        ),
      ],
      "Australia/Sydney",
    );
    const plan = generatePlan(input);
    const layover = {
      s: at("2027-03-10T22:00", "Asia/Dubai"),
      e: at("2027-03-11T07:00", "Asia/Dubai"),
    };
    const groundSleep = plan.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.kind === "SLEEP")
      .filter((b) => {
        const s = Temporal.Instant.from(b.startUtc).epochMilliseconds;
        const e = Temporal.Instant.from(b.endUtc).epochMilliseconds;
        return s < layover.e && e > layover.s;
      });
    for (const b of groundSleep) {
      const e = Temporal.Instant.from(b.endUtc).epochMilliseconds;
      expect(layover.e - e).toBeGreaterThanOrEqual(60 * 60_000);
    }
  });
});
