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
import { generatePlan, validatePlanInput } from "../src";
import { leg, trip } from "./trips";

// Arrival style "local": land 06:15 in Singapore; with the default the body
// clock keeps a morning sleep, with "local" it becomes a short nap and the
// night starts by 22:00 local.

const Z = "Asia/Singapore";

function arriveMorning(style?: "body-clock" | "local") {
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
        Z,
      ),
    ],
    Z,
  );
  input.traveler.habitualBedtime = "21:00";
  input.traveler.habitualWake = "05:00";
  if (style !== undefined) input.traveler.arrivalStyle = style;
  return generatePlan(input);
}

const local = (utc: string) => Temporal.Instant.from(utc).toZonedDateTimeISO(Z);
const onArrivalDay = (utc: string) =>
  local(utc).toPlainDate().toString() === "2027-03-11";

describe("arrival style", () => {
  it("default keeps the body-clock morning sleep after landing", () => {
    const plan = arriveMorning();
    const morning = plan.days
      .flatMap((d) => d.blocks)
      .filter(
        (b) =>
          b.kind === "SLEEP" &&
          onArrivalDay(b.startUtc) &&
          local(b.startUtc).hour < 12,
      );
    expect(morning.length).toBeGreaterThan(0);
    expect(plan.warnings.map((w) => w.code)).not.toContain(
      "ARRIVAL_LOCAL_TIME",
    );
  });

  it('"local" turns it into a nap of at most 90 min and goes to bed by 22:00', () => {
    const plan = arriveMorning("local");
    const blocks = plan.days.flatMap((d) => d.blocks);
    const daytimeSleep = blocks.filter((b) => {
      if (b.kind !== "SLEEP" || !onArrivalDay(b.startUtc)) return false;
      const h = local(b.startUtc).hour;
      return h >= 8 && h < 20;
    });
    expect(daytimeSleep).toEqual([]);
    const nap = blocks.find((b) => b.reasonCode === "NAP_ARRIVAL");
    expect(nap).toBeDefined();
    if (nap === undefined) return;
    expect(
      Temporal.Instant.from(nap.endUtc)
        .since(Temporal.Instant.from(nap.startUtc))
        .total("minutes"),
    ).toBeLessThanOrEqual(90);
    const night = blocks.find(
      (b) =>
        b.kind === "SLEEP" &&
        onArrivalDay(b.startUtc) &&
        local(b.startUtc).hour >= 20,
    );
    expect(night).toBeDefined();
    if (night !== undefined)
      expect(local(night.startUtc).hour).toBeLessThanOrEqual(22);
    expect(plan.warnings.map((w) => w.code)).toContain("ARRIVAL_LOCAL_TIME");
  });

  it("rejects an unknown arrival style", () => {
    const input = trip(
      [
        leg(
          "PRG",
          "SFO",
          "2027-03-10T07:00",
          "2027-03-10T17:00",
          "Europe/Prague",
          "America/Los_Angeles",
        ),
      ],
      "America/Los_Angeles",
    );
    (input.traveler as { arrivalStyle?: string }).arrivalStyle = "fast";
    expect(validatePlanInput(input).ok).toBe(false);
  });
});
