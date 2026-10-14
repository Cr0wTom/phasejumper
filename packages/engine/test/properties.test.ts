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
import type { BlockKind, PlanInput, PlanResult } from "../src/types";

// T03 acceptance property tests over 500 random inputs.
import { inputs } from "./arbitraries";

const RUNS = { numRuns: 500, seed: 20261012 };

// Same seed → every property sees the same inputs, so plans are cached.
const plans = new Map<string, PlanResult>();

function check(predicate: (input: PlanInput, plan: PlanResult) => void): void {
  fc.assert(
    fc.property(inputs, (input) => {
      const key = JSON.stringify(input);
      let plan = plans.get(key);
      if (plan === undefined) {
        plan = generatePlan(input);
        plans.set(key, plan);
      }
      predicate(input, plan);
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
      const followsReport = new Set(
        plan.warnings
          .filter((w) => w.code === "PLAN_ADJUSTED_TO_SLEEP")
          .map((w) => w.dayIndex),
      );
      for (let i = 1; i < cbt.length; i += 1) {
        const step = ((cbt[i] ?? 0) - (cbt[i - 1] ?? 0)) / 60_000;
        // A reported sleep may move the body clock either way, by at most
        // one day's rate plus the 4 h re-anchoring cap.
        if (followsReport.has(i)) {
          expect(Math.abs(step - 1440)).toBeLessThanOrEqual(120 + 240);
          continue;
        }
        // Each step is one day plus a shift in the chosen direction, never
        // more than the rate (≤ 2 h/day).
        expect(sign * (step - 1440)).toBeGreaterThan(0);
        expect(sign * (step - 1440)).toBeLessThanOrEqual(120);
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
      // Forecast: never more than rate + 0.3 h in a day (§2.8).
      for (const d of plan.days) {
        expect(d.effectiveShiftHours).toBeLessThanOrEqual(2.3);
      }
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
        expect(day.blocks.map((b) => b.kind)).not.toContain("MELATONIN_OK");
      }
    });
  });

  it("priority trimming never leaves SLEEP/AVOID/SEEK blocks overlapping", () => {
    const exclusive: ReadonlySet<BlockKind> = new Set([
      "SLEEP",
      "SLEEP_INFLIGHT",
      "AVOID_LIGHT",
      "SEEK_LIGHT",
      "SEEK_LIGHT_ARTIFICIAL",
      "LIGHT_INFLIGHT_WINDOW",
    ]);
    check((_input, plan) => {
      const spans = plan.days
        .flatMap((d) => d.blocks)
        .filter((b) => exclusive.has(b.kind))
        .map((b) => [Date.parse(b.startUtc), Date.parse(b.endUtc)] as const)
        .sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i]?.[0]).toBeGreaterThanOrEqual(spans[i - 1]?.[1] ?? 0);
      }
    });
  });

  it("nothing is scheduled inside sleep, and trimmed blocks are ≥ 15 min", () => {
    check((_input, plan) => {
      const all = plan.days.flatMap((d) => d.blocks);
      const sleeps = all.filter(
        (b) => b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT",
      );
      for (const b of all) {
        if (b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT") continue;
        const len = (Date.parse(b.endUtc) - Date.parse(b.startUtc)) / 60_000;
        if (b.kind !== "MEAL" && b.kind !== "CAFFEINE_STOP") {
          expect(len).toBeGreaterThanOrEqual(15);
        }
        for (const s of sleeps) {
          const overlap =
            Date.parse(b.startUtc) < Date.parse(s.endUtc) &&
            Date.parse(s.startUtc) < Date.parse(b.endUtc);
          expect(overlap).toBe(false);
        }
      }
    });
  });

  it("is deterministic", () => {
    check((input, plan) => {
      expect(generatePlan(input)).toEqual(plan);
    });
  });

  it("EXERCISE_OK is leftover: ≥ 15 min, no overlap with GOOD, AVOID, SLEEP or a flight", () => {
    check((input, plan) => {
      const kinds = plan.days.flatMap((d) => d.blocks.map((b) => b.kind));
      if (!input.traveler.exercise.enabled) {
        expect(kinds).not.toContain("EXERCISE_OK");
        expect(kinds).not.toContain("EXERCISE_GOOD");
        return;
      }
      const flights = input.itinerary.legs.map((leg) => {
        const start = Temporal.PlainDateTime.from(leg.departureLocal)
          .toZonedDateTime(leg.departureTz)
          .toInstant().epochMilliseconds;
        const end = Temporal.PlainDateTime.from(leg.arrivalLocal)
          .toZonedDateTime(leg.arrivalTz)
          .toInstant().epochMilliseconds;
        return [start, end] as const;
      });
      for (const day of plan.days) {
        if (day.flags.includes("FLIGHT_DAY")) {
          expect(day.blocks.map((b) => b.kind)).not.toContain("EXERCISE_OK");
        }
        const ok = day.blocks.filter((b) => b.kind === "EXERCISE_OK");
        const blockers = day.blocks.filter(
          (b) =>
            b.kind === "EXERCISE_GOOD" ||
            b.kind === "EXERCISE_AVOID" ||
            b.kind === "SLEEP" ||
            b.kind === "SLEEP_INFLIGHT",
        );
        for (const piece of ok) {
          const start = Date.parse(piece.startUtc);
          const end = Date.parse(piece.endUtc);
          expect((end - start) / 60_000).toBeGreaterThanOrEqual(15);
          for (const other of blockers) {
            expect(
              start < Date.parse(other.endUtc) &&
                Date.parse(other.startUtc) < end,
            ).toBe(false);
          }
          for (const [from, to] of flights) {
            expect(start < to && from < end).toBe(false);
          }
        }
      }
    });
  });
});
