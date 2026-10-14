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

// Sleep before an early flight: awake 3 h before departure, bedtime at most
// 1 h earlier, a nap if the night is still short.

const depart = (time: string) =>
  trip(
    [
      leg(
        "PRG",
        "SFO",
        `2027-01-15T${time}`,
        "2027-01-15T13:05",
        "Europe/Prague",
        "America/Los_Angeles",
      ),
    ],
    "America/Los_Angeles",
  );

function nightBefore(input: ReturnType<typeof depart>) {
  const plan = generatePlan(input);
  const dep = Temporal.PlainDateTime.from(
    input.itinerary.legs[0]?.departureLocal ?? "",
  )
    .toZonedDateTime("Europe/Prague")
    .toInstant();
  const blocks = plan.days.flatMap((d) => d.blocks);
  const sleep = blocks
    .filter((b) => b.kind === "SLEEP")
    .filter(
      (b) =>
        Temporal.Instant.compare(Temporal.Instant.from(b.endUtc), dep) <= 0,
    )
    .at(-1);
  return { plan, dep, sleep, blocks };
}

describe("sleep before a flight", () => {
  it("ends 3 h before an early departure and starts at most 1 h early", () => {
    const { plan, dep, sleep } = nightBefore(depart("07:15"));
    expect(sleep).toBeDefined();
    if (sleep === undefined) return;
    const end = Temporal.Instant.from(sleep.endUtc);
    const start = Temporal.Instant.from(sleep.startUtc).toZonedDateTimeISO(
      "Europe/Prague",
    );
    expect(dep.since(end).total("minutes")).toBeGreaterThanOrEqual(180);
    // Usual bedtime 23:00; never before 22:00.
    expect(start.hour * 60 + start.minute).toBeGreaterThanOrEqual(22 * 60);
    expect(start.hour).toBeGreaterThanOrEqual(22);
    expect(plan.warnings.map((w) => w.code)).toContain("SLEEP_BEFORE_FLIGHT");
  });

  it("makes up a short night with sleep on board or a nap", () => {
    const { blocks, dep } = nightBefore(depart("05:00"));
    // Awake by 02:00, bed no earlier than 22:00: 4 h on the ground. The rest
    // of the night is in the air, so it continues as sleep on board.
    const after = blocks.filter(
      (b) =>
        (b.kind === "NAP" || b.kind === "SLEEP_INFLIGHT") &&
        Temporal.Instant.compare(Temporal.Instant.from(b.startUtc), dep) >= 0,
    );
    expect(after.length).toBeGreaterThan(0);
  });

  it("leaves a night alone when the flight is late enough", () => {
    const { plan, sleep } = nightBefore(depart("13:30"));
    expect(plan.warnings.map((w) => w.code)).not.toContain(
      "SLEEP_BEFORE_FLIGHT",
    );
    const start = Temporal.Instant.from(
      sleep?.startUtc ?? "",
    ).toZonedDateTimeISO("Europe/Prague");
    expect(start.hour).toBe(23);
  });
});
