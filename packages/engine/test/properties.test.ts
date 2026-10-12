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

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { generatePlan } from "../src/index";
import type { PlanInput, PlanResult } from "../src/types";

// T03 acceptance property tests over 500 random inputs.

const ZONES = [
  "Europe/Prague",
  "Europe/London",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/St_Johns",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Africa/Johannesburg",
  "America/Sao_Paulo",
] as const;

const clock = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.constantFrom(0, 15, 30, 45))
  .map(
    ([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );

const inputs: fc.Arbitrary<PlanInput> = fc
  .record({
    bed: clock,
    sleepHours: fc.integer({ min: 5, max: 11 }),
    chronotype: fc.constantFrom("morning", "intermediate", "evening"),
    sleepNeedHours: fc.option(fc.integer({ min: 6, max: 10 }), {
      nil: undefined,
    }),
    useMelatonin: fc.boolean(),
    melatoninContraindicated: fc.boolean(),
    caffeine: fc.constantFrom("none", "normal", "heavy"),
    exercise: fc.boolean(),
    meditation: fc.boolean(),
    meals: fc.boolean(),
    preAdjustDays: fc.constantFrom(0, 1, 2, 3),
    home: fc.constantFrom(...ZONES),
    destination: fc.constantFrom(...ZONES),
    // 2026-01-01 .. 2028-12-31, minute resolution.
    departureEpochMinutes: fc.integer({
      min: 29_454_720,
      max: 31_032_000,
    }),
    flightMinutes: fc.integer({ min: 60, max: 1200 }),
    tripDays: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
  })
  .map((r) => {
    const bedMinutes =
      Number(r.bed.slice(0, 2)) * 60 + Number(r.bed.slice(3, 5));
    const wakeMinutes = (bedMinutes + r.sleepHours * 60) % 1440;
    const wake = `${String(Math.floor(wakeMinutes / 60)).padStart(2, "0")}:${String(wakeMinutes % 60).padStart(2, "0")}`;
    const dep = Temporal.Instant.fromEpochMilliseconds(
      r.departureEpochMinutes * 60_000,
    );
    const arr = dep.add({ minutes: r.flightMinutes });
    return {
      traveler: {
        habitualBedtime: r.bed,
        habitualWake: wake,
        chronotype: r.chronotype,
        ...(r.sleepNeedHours === undefined
          ? {}
          : { sleepNeedHours: r.sleepNeedHours }),
        useMelatonin: r.useMelatonin,
        melatoninContraindicated: r.melatoninContraindicated,
        caffeine: r.caffeine,
        exercise: { enabled: r.exercise },
        meditation: { enabled: r.meditation },
        mealTiming: { enabled: r.meals },
        preAdjustDays: r.preAdjustDays,
      },
      itinerary: {
        homeTz: r.home,
        destinationTz: r.destination,
        legs: [
          {
            departureAirport: "AAA",
            arrivalAirport: "BBB",
            departureLocal: dep
              .toZonedDateTimeISO(r.home)
              .toPlainDateTime()
              .toString(),
            arrivalLocal: arr
              .toZonedDateTimeISO(r.destination)
              .toPlainDateTime()
              .toString(),
            departureTz: r.home,
            arrivalTz: r.destination,
          },
        ],
        ...(r.tripDays === undefined ? {} : { tripDays: r.tripDays }),
      },
      now: "2026-01-01T00:00:00Z",
    } satisfies PlanInput;
  });

const RUNS = { numRuns: 500, seed: 20261012 };

function check(predicate: (input: PlanInput, plan: PlanResult) => void): void {
  fc.assert(
    fc.property(inputs, (input) => {
      predicate(input, generatePlan(input));
    }),
    RUNS,
  );
}

/**
 * Minutes CBTmin still has to travel in the chosen direction, in destination
 * wall time. Negative = past the target, which only a DST change at the
 * destination can cause (≤ 60 min). Real distances are ≤ 1320 min (|delta| ≥ 2 h).
 */
function remaining(
  plan: PlanResult,
  input: PlanInput,
  cbtMinUtc: string,
): number {
  const z = Temporal.Instant.from(cbtMinUtc).toZonedDateTimeISO(
    input.itinerary.destinationTz,
  );
  const [h, m] = plan.decision.targetCbtMinLocal.split(":").map(Number);
  const diff = z.hour * 60 + z.minute - ((h ?? 0) * 60 + (m ?? 0));
  const wrap = (x: number): number => ((x % 1440) + 1440) % 1440;
  const d = plan.decision.direction === "advance" ? wrap(diff) : wrap(-diff);
  return d >= 1380 ? d - 1440 : d;
}

// 500 plans per property; generous timeout so slower CI runners do not flake.
describe("engine properties", { timeout: 30_000 }, () => {
  it("every block has endUtc > startUtc", () => {
    check((_input, plan) => {
      for (const day of plan.days) {
        for (const b of day.blocks) {
          expect(Date.parse(b.endUtc)).toBeGreaterThan(Date.parse(b.startUtc));
        }
      }
    });
  });

  it("CBTmin moves monotonically toward the target", () => {
    check((input, plan) => {
      const { direction } = plan.decision;
      if (direction !== "advance" && direction !== "delay") return;
      const sign = direction === "advance" ? -1 : 1;
      const cbt = plan.days.map((d) => Date.parse(d.cbtMinUtc));
      for (let i = 1; i < cbt.length; i += 1) {
        const prev = plan.days[i - 1];
        const step = ((cbt[i] ?? 0) - (cbt[i - 1] ?? 0)) / 60_000;
        // Each step is one day plus the day's shift in the chosen direction.
        expect(step - 1440).toBe(sign * (prev?.effectiveShiftHours ?? 0) * 60);
        expect(prev?.effectiveShiftHours).toBeGreaterThan(0);
        // Distance to the target never grows, except by a DST change at the
        // destination between the two days (at most 60 min).
        const before = remaining(
          plan,
          input,
          plan.days[i - 1]?.cbtMinUtc ?? "",
        );
        const after = remaining(plan, input, plan.days[i]?.cbtMinUtc ?? "");
        expect(after).toBeLessThanOrEqual(before + 60);
      }
      const last = plan.days[plan.days.length - 1];
      expect(last?.effectiveShiftHours).toBe(0);
      expect(
        Math.abs(remaining(plan, input, last?.cbtMinUtc ?? "")),
      ).toBeLessThanOrEqual(60);
      expect(last?.misalignmentAfter).toBeLessThanOrEqual(1);
    });
  });

  it("never exceeds chosenDays + 1 + preAdjustDays days", () => {
    check((input, plan) => {
      expect(plan.days.length).toBeLessThanOrEqual(
        plan.decision.chosenDays + 1 + input.traveler.preAdjustDays,
      );
    });
  });

  it("melatonin blocks never appear when contraindicated or not opted in", () => {
    check((input, plan) => {
      const t = input.traveler;
      if (t.useMelatonin && t.melatoninContraindicated !== true) return;
      for (const day of plan.days) {
        expect(day.blocks.map((b) => b.kind)).not.toContain("MELATONIN_WINDOW");
      }
    });
  });

  it("is deterministic", () => {
    check((input, plan) => {
      expect(generatePlan(input)).toEqual(plan);
    });
  });
});
